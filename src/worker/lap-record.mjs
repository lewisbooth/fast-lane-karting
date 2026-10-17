import fallbackSnapshot from '../static/fastest-lap.json' with { type: 'json' }

const RECORD_KEY = 'current'
const MAX_BODY_BYTES = 2048
const MAX_NAME_LENGTH = 80
const TIME_PATTERN = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/
const ADMIN_PATH = '/admin/lap-record'
const STATUS_MESSAGE = 'Live lap record temporarily unavailable; showing the last published record.'

function validName(value) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= MAX_NAME_LENGTH && !/[\p{Cc}\p{Cf}]/u.test(name) ? name : null
}

function validLapTime(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const time = String(value).trim()
  const seconds = Number(time)
  return TIME_PATTERN.test(time) && Number.isFinite(seconds) && seconds > 0 && seconds < 600 ? time : null
}

function validRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const name = validName(value.name)
  const lapTime = validLapTime(value.lapTime)
  return name && lapTime ? { name, lapTime } : null
}

const fallbackRecord = validRecord(fallbackSnapshot)
if (!fallbackRecord) throw new Error('Invalid published lap record fallback')

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character])
}

function page(body, status = 200, extraHeaders = {}) {
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lap record editor | Fast Lane Karting</title><style>
    :root{color-scheme:dark;font:16px/1.5 system-ui,sans-serif;background:#111;color:#f5f5f5}
    *{box-sizing:border-box}body{max-width:34rem;margin:0 auto;padding:2rem 1rem}
    a{color:#ff7477}h1{font-size:1.8rem;line-height:1.2}p{margin:1rem 0}
    label{display:block;margin:1.2rem 0 .3rem;font-weight:650}
    input{width:100%;min-height:2.8rem;padding:.65rem;border:1px solid #888;border-radius:.35rem;background:#222;color:#fff;font:inherit}
    button{margin-top:1.5rem;padding:.8rem 1.2rem;border:0;border-radius:.35rem;background:#ee2f34;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    .notice{padding:.9rem;border-left:4px solid #ee2f34;background:#262626}
    small{color:#ccc}
  </style></head><body><main>${body}</main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      // Native form POSTs send Origin: null under no-referrer.
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...extraHeaders
    }
  })
}

function errorPage(message, status, headers) {
  return page(`<h1>Lap record editor</h1><p class="notice">${escapeHtml(message)}</p><p><a href="${ADMIN_PATH}">Return to editor</a></p>`, status, headers)
}

function editorPage(record, isFallback) {
  const notice = isFallback ? '<p class="notice">No live record has been saved yet. The published fallback is shown.</p>' : ''
  return page(`<h1>Edit fastest lap</h1><p>Current record: <strong>${escapeHtml(record.lapTime)} seconds</strong> — ${escapeHtml(record.name)}</p>${notice}
    <form method="post" action="${ADMIN_PATH}" autocomplete="off">
      <label for="name">Driver name</label><input id="name" name="name" value="${escapeHtml(record.name)}" maxlength="${MAX_NAME_LENGTH}" required>
      <label for="lapTime">Lap time in seconds</label><input id="lapTime" name="lapTime" value="${escapeHtml(record.lapTime)}" inputmode="decimal" pattern="[0-9]+(\\.[0-9]{1,3})?" required>
      <small>Up to three decimal places; greater than 0 and less than 600 seconds.</small>
      <label for="password">Editor password</label><input id="password" name="password" type="password" autocomplete="off" required>
      <button type="submit">Save lap record</button>
    </form><p><a href="/layout">View track layout</a></p>`)
}

function bindingReady(env, operation) {
  return typeof env?.LAP_RECORD_PASSWORD === 'string' && env.LAP_RECORD_PASSWORD.length > 0 &&
    typeof env?.LAP_RECORDS?.get === 'function' &&
    (operation !== 'write' || typeof env.LAP_RECORDS.put === 'function')
}

async function currentRecord(env) {
  if (typeof env?.LAP_RECORDS?.get !== 'function') throw new Error('Lap record storage unavailable')
  const stored = await env.LAP_RECORDS.get(RECORD_KEY)
  if (stored === null) return { record: fallbackRecord, isFallback: true }
  const data = JSON.parse(stored)
  const record = validRecord(data)
  if (!record || typeof data.updatedAt !== 'string' || Number.isNaN(Date.parse(data.updatedAt))) {
    throw new Error('Invalid lap record in storage')
  }
  return { record, isFallback: false }
}

async function readBoundedForm(request) {
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new RangeError('Request too large')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError('Missing request body')
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new RangeError('Request too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(body))
}

async function passwordMatches(submitted, expected) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([submitted, expected].map(value =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))))
  const first = new Uint8Array(a)
  const second = new Uint8Array(b)
  let difference = 0
  for (let index = 0; index < first.length; index++) difference |= first[index] ^ second[index]
  return difference === 0
}

async function handleAdmin(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'HEAD') {
    return errorPage('Method not allowed.', 405, { Allow: 'GET, HEAD, POST' })
  }
  if (!bindingReady(env, request.method === 'POST' ? 'write' : 'read')) {
    return errorPage('Lap record editor is temporarily unavailable.', 503)
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      const { record, isFallback } = await currentRecord(env)
      const response = editorPage(record, isFallback)
      return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
    } catch {
      return errorPage('Could not load the current lap record.', 503)
    }
  }

  if (request.headers.get('origin') !== url.origin) return errorPage('Request origin not allowed.', 403)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    return errorPage('Expected a form submission.', 415)
  }
  if (typeof env.LAP_RECORD_RATE_LIMITER?.limit !== 'function') {
    return errorPage('Lap record editor is temporarily unavailable.', 503)
  }
  let limit
  try {
    limit = await env.LAP_RECORD_RATE_LIMITER.limit({
      key: `lap-record:${request.headers.get('CF-Connecting-IP') || 'unknown'}`
    })
  } catch {
    return errorPage('Lap record editor is temporarily unavailable.', 503)
  }
  if (limit?.success === false) return errorPage('Too many attempts. Please try again later.', 429, { 'Retry-After': '60' })
  if (limit?.success !== true) return errorPage('Lap record editor is temporarily unavailable.', 503)

  let form
  try {
    form = await readBoundedForm(request)
  } catch (error) {
    return errorPage(error instanceof RangeError ? 'Request too large.' : 'Invalid form submission.', error instanceof RangeError ? 413 : 400)
  }
  const single = key => form.getAll(key).length === 1 ? form.get(key) : null
  const name = validName(single('name'))
  const lapTime = validLapTime(single('lapTime'))
  const password = single('password')
  if (!name || !lapTime || typeof password !== 'string' || !password) {
    return errorPage('Enter a driver name, valid lap time and password.', 400)
  }
  if (!await passwordMatches(password, env.LAP_RECORD_PASSWORD)) return errorPage('Password not accepted.', 403)

  const saved = { name, lapTime, updatedAt: new Date().toISOString() }
  try {
    await env.LAP_RECORDS.put(RECORD_KEY, JSON.stringify(saved))
  } catch {
    return errorPage('Could not save the lap record. Please try again.', 503)
  }
  return page(`<h1>Lap record saved</h1><p class="notice"><strong>${escapeHtml(lapTime)} seconds</strong> — ${escapeHtml(name)}</p><p>The updated record may take a short time to appear at every location.</p><p><a href="${ADMIN_PATH}">Edit again</a> · <a href="/layout">View track layout</a></p>`)
}

function dynamicHeaders(sourceHeaders) {
  const headers = new Headers(sourceHeaders)
  for (const name of ['etag', 'last-modified', 'content-length', 'content-encoding']) headers.delete(name)
  headers.set('Cache-Control', 'no-store')
  return headers
}

async function handleLayout(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } })
  }
  let record = fallbackRecord
  let stale = false
  try {
    const current = await currentRecord(env)
    record = current.record
  } catch {
    stale = true
  }
  // Do not pass If-None-Match/If-Modified-Since through to the static binding.
  // Its ETag describes the published HTML, not the current KV-backed response.
  const assetUrl = new URL(request.url)
  assetUrl.pathname = '/layout'
  let source
  try {
    source = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }))
  } catch {
    return new Response('Track layout temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!source.ok) return new Response(request.method === 'HEAD' ? null : source.body, {
    status: source.status,
    headers: dynamicHeaders(source.headers)
  })
  if (request.method === 'HEAD') {
    await source.body?.cancel()
    return new Response(null, { status: source.status, headers: dynamicHeaders(source.headers) })
  }
  const rewriter = new HTMLRewriter()
    .on('.fastest-lap__name', { element(element) { element.setInnerContent(record.name, { html: false }) } })
    .on('.fastest-lap__lap-time', { element(element) { element.setInnerContent(record.lapTime, { html: false }) } })
  if (stale) {
    rewriter.on('.fastest-lap__status', {
      element(element) {
        element.removeAttribute('hidden')
        element.setInnerContent(STATUS_MESSAGE, { html: false })
      }
    })
  }
  const transformed = rewriter.transform(source)
  return new Response(transformed.body, { status: transformed.status, headers: dynamicHeaders(transformed.headers) })
}

function redirect(url, pathname, status) {
  const target = new URL(url)
  target.pathname = pathname
  return new Response(null, { status, headers: { Location: target.href, 'Cache-Control': 'no-store' } })
}

// Return null for unrelated routes so static assets and the newsletter keep
// their original routing and caching behavior.
export async function routeLapRecord(request, env, url = new URL(request.url)) {
  if (url.pathname === '/layout/' || url.pathname === '/layout.html') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return handleLayout(request, env)
    return redirect(url, '/layout', 301)
  }
  if (url.pathname === '/layout') return handleLayout(request, env)
  if (url.pathname === `${ADMIN_PATH}/`) return redirect(url, ADMIN_PATH, request.method === 'POST' ? 308 : 301)
  if (url.pathname === ADMIN_PATH) return handleAdmin(request, env, url)
  return null
}
