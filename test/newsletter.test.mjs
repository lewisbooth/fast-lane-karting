import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import worker from '../src/worker/index.mjs'

const origin = 'https://fast-lane-karting.example'
const nativeEnv = (send = async () => ({ messageId: 'test' })) => ({
  NEWSLETTER_TRANSPORT: 'cloudflare',
  NEWSLETTER_FROM: 'notifications@example.com',
  NEWSLETTER_TO: 'owner@example.com',
  EMAIL: { send }
})
const request = (data, options = {}) => new Request(`${origin}/api/newsletter`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify(data),
  ...options
})
afterEach(() => mock.restoreAll())

test('native delivery waits for send, uses fixed recipient, escapes content and ignores submitted recipient', async () => {
  let sent
  const email = "o'connor&team@example.org"
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  let responded = false
  const responsePromise = worker.fetch(request({ email: ` ${email} `, to: 'attacker@example.org' }), nativeEnv(async message => {
    sent = message
    await pending
  })).then(response => { responded = true; return response })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(responded, false)
  assert.equal(sent.to, 'owner@example.com')
  assert.equal(sent.from.email, 'notifications@example.com')
  assert.equal(sent.replyTo, email)
  assert.equal(sent.subject, `Newsletter Request from ${email} | Fast Lane Karting`)
  assert.equal(sent.text, `New Fast Lane Karting Newsletter Request\n\nFrom: ${email}\n`)
  assert.match(sent.html, /o&#39;connor&amp;team@example.org/)
  finish()
  const response = await responsePromise
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('bad email inputs, malformed JSON, wrong content type and cross-site origin never send', async () => {
  const send = mock.fn()
  for (const email of ['', null, 123, 'no-domain', 'x@localhost', 'x@example.org\r\nBcc:a@example.org', '<img>@example.org', `${'a'.repeat(255)}@example.org`]) {
    assert.equal((await worker.fetch(request({ email }), nativeEnv(send))).status, 400)
  }
  assert.equal((await worker.fetch(request(null), nativeEnv(send))).status, 400)
  assert.equal((await worker.fetch(request({}, { body: '{' }), nativeEnv(send))).status, 400)
  assert.equal((await worker.fetch(request({}, { headers: { 'Content-Type': 'text/plain' } }), nativeEnv(send))).status, 415)
  assert.equal((await worker.fetch(request({}, { headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' } }), nativeEnv(send))).status, 403)
  assert.equal(send.mock.callCount(), 0)
})

test('size limit applies to declared and streamed bodies', async () => {
  const send = mock.fn()
  assert.equal((await worker.fetch(request({ email: 'x@example.org' }, {
    headers: { 'Content-Type': 'application/json', 'Content-Length': '1025' }
  }), nativeEnv(send))).status, 413)
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1025)) },
    cancel() { cancelled = true }
  })
  const response = await worker.fetch(request({}, { body: stream, duplex: 'half' }), nativeEnv(send))
  assert.equal(response.status, 413)
  assert.equal(cancelled, true)
  assert.equal(send.mock.callCount(), 0)
})

test('API route and method errors remain JSON; other paths delegate to assets', async () => {
  const response = await worker.fetch(new Request(`${origin}/api/newsletter`), {})
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'POST')
  assert.equal((await worker.fetch(new Request(`${origin}/api/unknown`), {})).status, 404)
  const original = new Request(`${origin}/offers`)
  const assets = mock.fn(async forwarded => {
    assert.equal(forwarded, original)
    return new Response('offers')
  })
  assert.equal(await (await worker.fetch(original, { ASSETS: { fetch: assets } })).text(), 'offers')
})

test('native send failure and missing binding are errors with no legacy fallback or sensitive logs', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fall back') })
  const log = mock.method(console, 'error', () => {})
  const failed = await worker.fetch(request({ email: 'private@example.org' }), nativeEnv(async () => {
    throw new Error('provider private@example.org failure')
  }))
  assert.equal(failed.status, 502)
  assert.equal((await failed.json()).success, undefined)
  const env = nativeEnv()
  delete env.EMAIL
  assert.equal((await worker.fetch(request({ email: 'x@example.org' }), env)).status, 502)
  assert.equal(fetch.mock.callCount(), 0)
  assert.ok(log.mock.calls.every(call => !JSON.stringify(call.arguments).includes('private@example.org')))
})

test('legacy transport submits only the validated email and waits for a successful HTTP response', async () => {
  let submitted
  const fetch = mock.method(globalThis, 'fetch', async (url, options) => {
    submitted = { url, options }
    return new Response('accepted', { status: 200 })
  })
  const env = { NEWSLETTER_TRANSPORT: 'legacy', LEGACY_NEWSLETTER_API_KEY: 'test-key' }
  const response = await worker.fetch(request({ email: 'person@example.org', to: 'attacker@example.org' }), env)
  assert.equal(response.status, 200)
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(submitted.url, 'https://74386ydfki.execute-api.eu-west-1.amazonaws.com/production/fastLaneNewsletter')
  assert.deepEqual(JSON.parse(submitted.options.body), { email: 'person@example.org' })
  assert.equal(submitted.options.headers['x-api-key'], 'test-key')
  assert.equal(submitted.options.redirect, 'error')
  assert.ok(submitted.options.signal instanceof AbortSignal)
})

test('legacy rejection and network errors do not falsely report success', async () => {
  mock.method(console, 'error', () => {})
  const fetch = mock.method(globalThis, 'fetch', async () => new Response('upstream rejected', { status: 429 }))
  const env = { NEWSLETTER_TRANSPORT: 'legacy', LEGACY_NEWSLETTER_API_KEY: 'test-key' }
  assert.equal((await worker.fetch(request({ email: 'x@example.org' }), env)).status, 502)
  fetch.mock.mockImplementation(async () => { throw new Error('Network unavailable') })
  assert.equal((await worker.fetch(request({ email: 'x@example.org' }), env)).status, 502)
})
