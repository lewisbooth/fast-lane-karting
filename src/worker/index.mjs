const MAX_BODY_BYTES = 1024

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers }
  })
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value)
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character])
}

async function readJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    throw new RangeError('Request too large')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError('Missing body')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new RangeError('Request too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally {
    reader.releaseLock()
  }
}

async function sendNotification(email, env) {
  if (env.NEWSLETTER_TRANSPORT === 'cloudflare') {
    if (!env.EMAIL || !validEmail(env.NEWSLETTER_FROM) || !validEmail(env.NEWSLETTER_TO)) {
      throw new Error('Email configuration missing')
    }
    await env.EMAIL.send({
      to: env.NEWSLETTER_TO,
      from: { email: env.NEWSLETTER_FROM, name: 'Fast Lane Karting' },
      replyTo: email,
      subject: `Newsletter Request from ${email} | Fast Lane Karting`,
      text: `New Fast Lane Karting Newsletter Request\n\nFrom: ${email}\n`,
      html: `<h3>New Fast Lane Karting Newsletter Request</h3><p><strong>From: </strong> ${escapeHtml(email)}</p>`
    })
    return
  }

  // Temporary, explicit transport until Cloudflare's sending domain is ready.
  // A native-email failure must never also submit to the legacy service.
  if (env.NEWSLETTER_TRANSPORT !== 'legacy' || !env.LEGACY_NEWSLETTER_API_KEY) {
    throw new Error('Newsletter transport not configured')
  }
  let response
  try {
    response = await fetch('https://74386ydfki.execute-api.eu-west-1.amazonaws.com/production/fastLaneNewsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.LEGACY_NEWSLETTER_API_KEY },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    })
  } catch (error) {
    console.error(JSON.stringify({ event: 'newsletter_legacy_fetch_failed', type: error?.name || 'UnknownError' }))
    throw error
  }
  await response.body?.cancel()
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'newsletter_legacy_http_failure', status: response.status }))
    throw new Error('Newsletter provider rejected request')
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (url.pathname !== '/api/newsletter') return json({ error: 'Not found' }, 404)
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' })

    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403)
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'Content-Type must be application/json' }, 415)
    }

    let data
    try {
      data = await readJson(request)
    } catch (error) {
      return json({ error: error instanceof RangeError ? 'Request too large' : 'Invalid JSON' }, error instanceof RangeError ? 413 : 400)
    }
    const email = typeof data?.email === 'string' ? data.email.trim() : ''
    if (!validEmail(email)) return json({ error: 'A valid email address is required' }, 400)

    try {
      await sendNotification(email, env)
      return json({ success: true })
    } catch {
      // Do not put submitted email addresses or provider responses into logs.
      console.error(JSON.stringify({ event: 'newsletter_delivery_failed', transport: env.NEWSLETTER_TRANSPORT }))
      return json({ error: 'Unable to submit your request. Please try again later.' }, 502)
    }
  }
}
