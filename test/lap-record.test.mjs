import assert from 'node:assert/strict'
import { after, mock, test } from 'node:test'
import fallback from '../src/static/fastest-lap.json' with { type: 'json' }
import worker from '../src/worker/index.mjs'

const origin = 'https://fastlanekarting.example'
const secret = 'private-test-password'
const fixture = '<!doctype html><html><body><span class="fastest-lap__name">Published name</span><span class="fastest-lap__lap-time">26.4</span><p class="fastest-lap__status" hidden>Unavailable</p></body></html>'

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character])
}

// This double checks handler wiring and text escaping; Wrangler staging must
// still exercise the actual Workers HTMLRewriter implementation.
class FakeHTMLRewriter {
  constructor() { this.handlers = [] }
  on(selector, handler) { this.handlers.push({ selector, handler }); return this }
  transform(source) {
    const handlers = this.handlers
    const body = new ReadableStream({
      async start(controller) {
        try {
          const html = (await source.text()).replace(/<(span|p)([^>]*)>([^<]*)<\/\1>/g, (match, tag, attributes, content) => {
            const classes = /class="([^"]*)"/.exec(attributes)?.[1].split(/\s+/) || []
            for (const { selector, handler } of handlers) {
              if (!classes.includes(selector.slice(1))) continue
              const element = {
                setInnerContent(value, options) {
                  assert.equal(options.html, false)
                  content = escapeHtml(value)
                },
                removeAttribute(name) {
                  assert.equal(name, 'hidden')
                  attributes = attributes.replace(/\s+hidden(?:="[^"]*")?/, '')
                }
              }
              handler.element(element)
            }
            return `<${tag}${attributes}>${content}</${tag}>`
          })
          controller.enqueue(new TextEncoder().encode(html))
          controller.close()
        } catch (error) { controller.error(error) }
      }
    })
    return new Response(body, { status: source.status, headers: source.headers })
  }
}

const priorHTMLRewriter = globalThis.HTMLRewriter
globalThis.HTMLRewriter = FakeHTMLRewriter
after(() => { globalThis.HTMLRewriter = priorHTMLRewriter })

function env(overrides = {}) {
  return {
    LAP_RECORD_PASSWORD: secret,
    LAP_RECORDS: {
      get: async () => JSON.stringify({ name: 'Lillie Bourne', lapTime: '26.024', updatedAt: '2026-10-17T12:00:00.000Z' }),
      put: async () => {}
    },
    LAP_RECORD_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response(fixture, { headers: { 'Content-Type': 'text/html' } }) },
    ...overrides
  }
}

function form(data = {}, options = {}) {
  return new Request(`${origin}/admin/lap-record`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '203.0.113.7' },
    body: new URLSearchParams({ name: 'Lillie Bourne', lapTime: '26.024', password: secret, ...data }),
    ...options
  })
}

test('layout injects one KV record with no extra browser request or conditional asset response', async () => {
  const get = mock.fn(async () => JSON.stringify({ name: 'A&B <script>', lapTime: '26.024', updatedAt: '2026-10-17T12:00:00.000Z' }))
  const assetFetch = mock.fn(async forwarded => {
    assert.equal(forwarded.method, 'GET')
    assert.equal(forwarded.url, `${origin}/layout?campaign=fall`)
    assert.equal(forwarded.headers.get('if-none-match'), null)
    assert.equal(forwarded.headers.get('if-modified-since'), null)
    assert.equal(forwarded.headers.get('range'), null)
    return new Response(fixture, {
      headers: {
        'Content-Type': 'text/html', ETag: '"static-html"', 'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
        'Content-Length': '123', 'Content-Encoding': 'gzip'
      }
    })
  })
  const response = await worker.fetch(new Request(`${origin}/layout?campaign=fall`, {
    headers: { 'If-None-Match': '"static-html"', 'If-Modified-Since': 'Wed, 01 Jan 2025 00:00:00 GMT', Range: 'bytes=0-100' }
  }), env({ LAP_RECORDS: { get }, ASSETS: { fetch: assetFetch } }))
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /A&amp;B &lt;script&gt;/)
  assert.match(html, />26\.024<\/span>/)
  assert.match(html, /class="fastest-lap__status" hidden/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  for (const header of ['etag', 'last-modified', 'content-length', 'content-encoding']) {
    assert.equal(response.headers.get(header), null)
  }
  assert.equal(get.mock.callCount(), 1)
  assert.deepEqual(get.mock.calls[0].arguments, ['current'])
  assert.equal(assetFetch.mock.callCount(), 1)
})

test('layout fallback is visible on missing/invalid/unavailable storage; HEAD has the same safe headers without a body', async () => {
  for (const storage of [undefined, { get: async () => '{bad' }, { get: async () => { throw new Error('KV unavailable') } }]) {
    const response = await worker.fetch(new Request(`${origin}/layout`), env({ LAP_RECORDS: storage }))
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.ok(html.includes(escapeHtml(fallback.name)))
    assert.ok(html.includes(String(fallback.lapTime)))
    assert.match(html, /fastest-lap__status">Live lap record temporarily unavailable/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  const noOverride = await worker.fetch(new Request(`${origin}/layout`), env({ LAP_RECORDS: { get: async () => null } }))
  assert.match(await noOverride.text(), /class="fastest-lap__status" hidden/)

  const head = await worker.fetch(new Request(`${origin}/layout`, { method: 'HEAD', headers: { 'If-None-Match': '"static"' } }), env({
    ASSETS: { fetch: async forwarded => {
      assert.equal(forwarded.headers.get('if-none-match'), null)
      return new Response(fixture, { headers: { ETag: '"static"', 'Content-Length': '999', 'Content-Type': 'text/html' } })
    } }
  }))
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal(head.headers.get('cache-control'), 'no-store')
  assert.equal(head.headers.get('etag'), null)
  assert.equal(head.headers.get('content-length'), null)
})

test('public editor shows the current record and never leaks the secret into HTML or cache', async () => {
  const response = await worker.fetch(new Request(`${origin}/admin/lap-record`), env())
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /Lillie Bourne/)
  assert.match(html, /26\.024/)
  assert.match(html, /<form method="post" action="\/admin\/lap-record"/)
  assert.match(html, /name="password" type="password"/)
  assert.ok(!html.includes(secret))
  assert.ok(!html.includes('<script'))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.match(response.headers.get('content-security-policy'), /form-action 'self'/)
})

test('save awaits rate limit and KV write, preserves decimal precision, escapes output and never reads stale KV back', async () => {
  let releaseWrite
  const pending = new Promise(resolve => { releaseWrite = resolve })
  const put = mock.fn(async () => pending)
  const get = mock.fn(async () => { throw new Error('Must not re-read immediately') })
  const limiter = mock.fn(async () => ({ success: true }))
  const responsePromise = worker.fetch(form({ name: 'A&B <script>', lapTime: '26.024' }), env({
    LAP_RECORDS: { get, put }, LAP_RECORD_RATE_LIMITER: { limit: limiter }
  }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(put.mock.callCount(), 1)
  assert.equal(limiter.mock.callCount(), 1)
  assert.deepEqual(limiter.mock.calls[0].arguments, [{ key: 'lap-record:203.0.113.7' }])
  assert.equal(put.mock.calls[0].arguments[0], 'current')
  const saved = JSON.parse(put.mock.calls[0].arguments[1])
  assert.deepEqual({ name: saved.name, lapTime: saved.lapTime }, { name: 'A&B <script>', lapTime: '26.024' })
  assert.ok(!Number.isNaN(Date.parse(saved.updatedAt)))
  assert.equal(get.mock.callCount(), 0)
  releaseWrite()
  const response = await responsePromise
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /A&amp;B &lt;script&gt;/)
  assert.match(html, /26\.024 seconds/)
  assert.ok(!html.includes(secret))
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('bad origin, form, password, name and lap time never write', async () => {
  const put = mock.fn(async () => {})
  const store = env({ LAP_RECORDS: { get: async () => null, put } })
  const badRequests = [
    [form({}, { headers: { Origin: 'https://other.example', 'Content-Type': 'application/x-www-form-urlencoded' } }), 403],
    [form({}, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), 403],
    [form({}, { headers: { Origin: origin, 'Content-Type': 'text/plain' } }), 415],
    [form({ password: 'wrong' }), 403],
    [form({ name: 'A\nB' }), 400],
    [form({ name: 'a'.repeat(81) }), 400],
    [form({ lapTime: '0' }), 400],
    [form({ lapTime: '600' }), 400],
    [form({ lapTime: '26.0241' }), 400],
    [form({ lapTime: 'NaN' }), 400],
    [form({}, { body: 'name=A&name=B&lapTime=26.024&password=private-test-password' }), 400]
  ]
  for (const [request, expected] of badRequests) {
    assert.equal((await worker.fetch(request, store)).status, expected)
  }
  assert.equal(put.mock.callCount(), 0)
})

test('declared and streamed form body limits reject without writing', async () => {
  const put = mock.fn(async () => {})
  const store = env({ LAP_RECORDS: { get: async () => null, put } })
  const declared = form({}, { headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': '2049' } })
  assert.equal((await worker.fetch(declared, store)).status, 413)
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2049)) },
    cancel() { cancelled = true }
  })
  const request = form({}, { body: stream, duplex: 'half' })
  assert.equal((await worker.fetch(request, store)).status, 413)
  assert.equal(cancelled, true)
  assert.equal(put.mock.callCount(), 0)
})

test('missing secret/KV/limiter, denial, malformed result, and write failure never report a successful save', async () => {
  const put = mock.fn(async () => { throw new Error('Storage failure') })
  assert.equal((await worker.fetch(form(), env({ LAP_RECORD_PASSWORD: undefined }))).status, 503)
  assert.equal((await worker.fetch(form(), env({ LAP_RECORDS: undefined }))).status, 503)
  assert.equal((await worker.fetch(new Request(`${origin}/admin/lap-record`), env({ LAP_RECORDS: undefined }))).status, 503)
  assert.equal((await worker.fetch(form(), env({ LAP_RECORD_RATE_LIMITER: undefined }))).status, 503)
  const limited = await worker.fetch(form(), env({ LAP_RECORD_RATE_LIMITER: { limit: async () => ({ success: false }) } }))
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '60')
  for (const result of [null, {}, { success: 'true' }]) {
    assert.equal((await worker.fetch(form(), env({ LAP_RECORD_RATE_LIMITER: { limit: async () => result } }))).status, 503)
  }
  assert.equal((await worker.fetch(form(), env({ LAP_RECORD_RATE_LIMITER: { limit: async () => { throw new Error('Limited') } } }))).status, 503)
  assert.equal((await worker.fetch(form(), env({ LAP_RECORDS: { get: async () => null, put } }))).status, 503)
  assert.equal(put.mock.callCount(), 1)
  const badCurrent = await worker.fetch(new Request(`${origin}/admin/lap-record`), env({ LAP_RECORDS: { get: async () => '{bad' } }))
  assert.equal(badCurrent.status, 503)
})

test('canonical aliases preserve query; other routes and newsletter remain delegated unchanged', async () => {
  for (const route of ['/layout/', '/layout.html', '/admin/lap-record/']) {
    const response = await worker.fetch(new Request(`${origin}${route}?source=test`), {})
    assert.equal(response.status, 301)
    assert.equal(response.headers.get('location'), `${origin}${route.startsWith('/layout') ? '/layout' : '/admin/lap-record'}?source=test`)
  }
  const redirectedPost = await worker.fetch(form({}, { method: 'POST' }).clone(), env())
  assert.equal(redirectedPost.status, 200)
  const aliasPost = await worker.fetch(new Request(`${origin}/admin/lap-record/?source=test`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'name=A&lapTime=26.024&password=test'
  }), {})
  assert.equal(aliasPost.status, 308)
  assert.equal(aliasPost.headers.get('location'), `${origin}/admin/lap-record?source=test`)
  const original = new Request(`${origin}/offers`)
  const assets = mock.fn(async forwarded => {
    assert.equal(forwarded, original)
    return new Response('static offers')
  })
  assert.equal(await (await worker.fetch(original, { ASSETS: { fetch: assets } })).text(), 'static offers')
  assert.equal(assets.mock.callCount(), 1)
  assert.equal((await worker.fetch(new Request(`${origin}/api/newsletter`), {})).status, 405)
})
