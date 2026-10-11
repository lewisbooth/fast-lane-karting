import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
  assert.equal(submitted.options.redirect, 'manual')
  assert.ok(submitted.options.signal instanceof AbortSignal)
})

test('legacy rejection and network errors do not falsely report success', async () => {
  mock.method(console, 'error', () => {})
  const fetch = mock.method(globalThis, 'fetch', async () => new Response('upstream rejected', { status: 429 }))
  const env = { NEWSLETTER_TRANSPORT: 'legacy', LEGACY_NEWSLETTER_API_KEY: 'test-key' }
  assert.equal((await worker.fetch(request({ email: 'x@example.org' }), env)).status, 502)
  fetch.mock.mockImplementation(async () => new Response(null, {
    status: 302,
    headers: { Location: 'https://untrusted.example/' }
  }))
  assert.equal((await worker.fetch(request({ email: 'x@example.org' }), env)).status, 502)
  fetch.mock.mockImplementation(async () => { throw new Error('Network unavailable') })
  assert.equal((await worker.fetch(request({ email: 'x@example.org' }), env)).status, 502)
})

const mailchimpEnv = (optIn = 'double') => ({
  NEWSLETTER_TRANSPORT: 'mailchimp',
  MAILCHIMP_API_KEY: 'private-test-key-us21',
  MAILCHIMP_AUDIENCE_ID: 'abc123',
  MAILCHIMP_OPT_IN: optIn,
  NEWSLETTER_RATE_LIMITER: { limit: async () => ({ success: true }) }
})

test('Mailchimp validates input and awaits rate limiting before contacting the provider', async () => {
  let allow
  const allowed = new Promise(resolve => { allow = resolve })
  const limit = mock.fn(async () => allowed)
  const env = { ...mailchimpEnv(), NEWSLETTER_RATE_LIMITER: { limit } }
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json({ status: 'pending' }))
  assert.equal((await worker.fetch(request({ email: 'invalid' }), env)).status, 400)
  assert.equal(limit.mock.callCount(), 0)
  assert.equal(fetch.mock.callCount(), 0)

  const responsePromise = worker.fetch(request({ email: 'person@example.org' }, {
    headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '203.0.113.42' }
  }), env)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(limit.mock.calls[0].arguments, [{ key: 'newsletter:203.0.113.42' }])
  assert.equal(fetch.mock.callCount(), 0)
  allow({ success: true })
  assert.equal((await responsePromise).status, 200)
  assert.equal(fetch.mock.callCount(), 1)

  assert.equal((await worker.fetch(request({ email: 'person@example.org' }), env)).status, 200)
  assert.deepEqual(limit.mock.calls[1].arguments, [{ key: 'newsletter:unknown' }])
})

test('Mailchimp rate limiting returns 429 with a retry time and never contacts the provider', async () => {
  const limit = mock.fn(async () => ({ success: false }))
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Must not contact provider') })
  const response = await worker.fetch(request({ email: 'person@example.org' }), {
    ...mailchimpEnv(), NEWSLETTER_RATE_LIMITER: { limit }
  })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { error: 'Too many requests. Please try again later.' })
  assert.equal(limit.mock.callCount(), 1)
  assert.equal(fetch.mock.callCount(), 0)
})

test('Mailchimp missing, failed and malformed rate limiter bindings fail closed without sensitive logs', async () => {
  const email = 'private@example.org'
  const log = mock.method(console, 'error', () => {})
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Must not contact provider') })
  for (const binding of [
    undefined,
    {},
    { limit: 'invalid' },
    { limit: async () => { throw new Error(`${email} private-test-key-us21 203.0.113.42`) } },
    { limit: async () => null },
    { limit: async () => ({}) },
    { limit: async () => ({ success: 'true' }) }
  ]) {
    const response = await worker.fetch(request({ email }), {
      ...mailchimpEnv(), NEWSLETTER_RATE_LIMITER: binding
    })
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'Unable to submit your request. Please try again later.' })
  }
  assert.equal(fetch.mock.callCount(), 0)
  for (const value of [email, 'private-test-key-us21', '203.0.113.42']) {
    assert.ok(log.mock.calls.every(call => !JSON.stringify(call.arguments).includes(value)))
  }
})

test('Mailchimp subscribes through the Worker without changing existing subscription status', async () => {
  let sent
  const fetch = mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options }
    return Response.json({ status: 'pending' })
  })
  const email = 'Person+News@Example.org'
  const response = await worker.fetch(request({ email, to: 'attacker@example.org' }), mailchimpEnv())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, pending: true })
  assert.equal(fetch.mock.callCount(), 1)
  const hash = createHash('md5').update(email.toLowerCase()).digest('hex')
  assert.equal(sent.url, `https://us21.api.mailchimp.com/3.0/lists/abc123/members/${hash}?fields=status`)
  assert.equal(sent.options.method, 'PUT')
  assert.equal(sent.options.headers.Authorization, 'Bearer private-test-key-us21')
  assert.deepEqual(JSON.parse(sent.options.body), { email_address: email, status_if_new: 'pending' })
  assert.equal(sent.options.redirect, 'manual')
  assert.ok(sent.options.signal instanceof AbortSignal)

  fetch.mock.mockImplementation(async (url, options) => {
    sent = { url, options }
    return Response.json({ status: 'subscribed' })
  })
  const single = await worker.fetch(request({ email }), mailchimpEnv('single'))
  assert.deepEqual(await single.json(), { success: true, pending: false })
  assert.deepEqual(JSON.parse(sent.options.body), { email_address: email, status_if_new: 'subscribed' })
})

test('Mailchimp preserves an existing member status when it differs from the configured opt-in', async () => {
  const submitted = []
  const fetch = mock.method(globalThis, 'fetch', async (url, options) => {
    submitted.push({ url, body: JSON.parse(options.body) })
    return Response.json({ status: submitted.length === 1 ? 'subscribed' : 'pending' })
  })
  const email = 'person@example.org'
  const subscribed = await worker.fetch(request({ email }), mailchimpEnv('double'))
  assert.equal(subscribed.status, 200)
  assert.deepEqual(await subscribed.json(), { success: true, pending: false })
  const pending = await worker.fetch(request({ email }), mailchimpEnv('single'))
  assert.equal(pending.status, 200)
  assert.deepEqual(await pending.json(), { success: true, pending: true })
  assert.deepEqual(submitted.map(({ body }) => body), [
    { email_address: email, status_if_new: 'pending' },
    { email_address: email, status_if_new: 'subscribed' }
  ])
  assert.equal(fetch.mock.callCount(), 2)
  assert.ok(submitted.every(({ url }) => url.startsWith('https://us21.api.mailchimp.com/')))
})

test('Mailchimp inactive members and upstream failures do not report success or fall back', async () => {
  const log = mock.method(console, 'error', () => {})
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json({ status: 'unsubscribed' }))
  const email = 'private@example.org'
  for (const status of ['unsubscribed', 'cleaned', 'transactional']) {
    fetch.mock.mockImplementation(async () => Response.json({ status }))
    assert.equal((await worker.fetch(request({ email }), mailchimpEnv())).status, 502)
  }
  fetch.mock.mockImplementation(async () => new Response('private@example.org', { status: 401 }))
  assert.equal((await worker.fetch(request({ email }), mailchimpEnv())).status, 502)
  fetch.mock.mockImplementation(async () => new Response(null, { status: 302 }))
  assert.equal((await worker.fetch(request({ email }), mailchimpEnv())).status, 502)
  assert.equal(fetch.mock.callCount(), 5)
  assert.ok(log.mock.calls.every(call => !JSON.stringify(call.arguments).includes(email)))
})

test('Mailchimp rejects malformed, null and oversized responses without exposing provider data or falling back', async () => {
  const email = 'private@example.org'
  const providerData = 'provider-private@example.org'
  const log = mock.method(console, 'error', () => {})
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Mock response must be configured') })
  let cancelled = false
  const oversizedStream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(providerData.repeat(50))) },
    cancel() { cancelled = true }
  })
  const responses = [
    new Response(`{"status":"pending","private":"${providerData}"`),
    Response.json(null),
    Response.json({}),
    new Response(new Uint8Array([0xff])),
    Response.json({ status: 'pending' }, { headers: { 'Content-Length': '1025' } }),
    new Response(oversizedStream)
  ]
  for (const upstream of responses) {
    fetch.mock.mockImplementation(async () => upstream)
    const response = await worker.fetch(request({ email }), mailchimpEnv())
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'Unable to submit your request. Please try again later.' })
  }
  assert.equal(cancelled, true)
  assert.equal(fetch.mock.callCount(), responses.length)
  assert.ok(fetch.mock.calls.every(call => call.arguments[0].startsWith('https://us21.api.mailchimp.com/')))
  for (const value of [email, providerData, 'private-test-key-us21']) {
    assert.ok(log.mock.calls.every(call => !JSON.stringify(call.arguments).includes(value)))
  }
})

test('Mailchimp provider rate limits, network failures and timeouts do not report success or fall back', async () => {
  const email = 'private@example.org'
  const log = mock.method(console, 'error', () => {})
  const fetch = mock.method(globalThis, 'fetch', async () => new Response(email, { status: 429 }))
  const implementations = [
    async () => new Response(email, { status: 429 }),
    async () => { throw new Error(`${email} private-test-key-us21`) },
    async () => { throw new DOMException(`${email} private-test-key-us21`, 'TimeoutError') }
  ]
  for (const implementation of implementations) {
    fetch.mock.mockImplementation(implementation)
    const response = await worker.fetch(request({ email }), mailchimpEnv())
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'Unable to submit your request. Please try again later.' })
  }
  assert.equal(fetch.mock.callCount(), implementations.length)
  assert.ok(fetch.mock.calls.every(call => call.arguments[0].startsWith('https://us21.api.mailchimp.com/')))
  for (const value of [email, 'private-test-key-us21']) {
    assert.ok(log.mock.calls.every(call => !JSON.stringify(call.arguments).includes(value)))
  }
})

test('Mailchimp requires the audience, key and explicit opt-in choice before contacting the API', async () => {
  mock.method(console, 'error', () => {})
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Must not contact provider') })
  for (const [field, value] of [
    ['MAILCHIMP_API_KEY', 'no-data-center'],
    ['MAILCHIMP_AUDIENCE_ID', ''],
    ['MAILCHIMP_OPT_IN', '']
  ]) {
    const env = mailchimpEnv()
    env[field] = value
    assert.equal((await worker.fetch(request({ email: 'x@example.org' }), env)).status, 502)
  }
  assert.equal(fetch.mock.callCount(), 0)
})
