import { buildPaidUpstream, PAID_RESPONSE_HEADERS } from './imd-paid-routes.js'
import { validateImdRequestBody } from './imd-fairlaunch.js'

const DEFAULT_IMD_API = 'https://api.imd.fun'
const MAX_BODY_BYTES = 1024 * 1024
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new Error('request_body_too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function relay(res, fetchImpl, target, init = {}, copyHeaders = []) {
  const upstream = await fetchImpl(target, init)
  const text = await upstream.text()
  res.statusCode = upstream.status
  res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  for (const name of copyHeaders) {
    const value = upstream.headers.get(name)
    if (value) res.setHeader(name, value)
  }
  res.end(text)
}

export async function handleImdRequest(req, res, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const imdApi = options.imdApi || DEFAULT_IMD_API

  try {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/imd/')) return false

    if (req.method === 'GET' && url.pathname === '/api/imd/jobs') {
      const query = new URLSearchParams()
      query.set('limit', String(Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 60))))
      if (url.searchParams.get('exclude') === 'oracle') query.set('exclude', 'oracle')
      await relay(res, fetchImpl, `${imdApi}/jobs?${query}`, { headers: { accept: 'application/json' } })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/imd/capabilities') {
      await relay(res, fetchImpl, `${imdApi}/requests/capabilities`, { headers: { accept: 'application/json' } })
      return true
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/imd/workflows/')) {
      const workflowId = url.pathname.slice('/api/imd/workflows/'.length)
      if (!UUID.test(workflowId)) {
        sendJson(res, 400, { error: 'invalid_workflow_id' })
        return true
      }
      await relay(res, fetchImpl, `${imdApi}/workflows/${workflowId}`, { headers: { accept: 'application/json' } })
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/imd/check') {
      const body = validateImdRequestBody(await readBody(req))
      await relay(res, fetchImpl, `${imdApi}/requests/check`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body })
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/imd/quote') {
      const token = req.headers['x-personality-request-token']
      if (!/^[0-9a-f]{64}$/.test(String(token || ''))) {
        sendJson(res, 401, { error: 'invalid_request_token' })
        return true
      }
      const body = validateImdRequestBody(await readBody(req), { requireRequestKey: true })
      await relay(res, fetchImpl, `${imdApi}/requests/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
        body,
      })
      return true
    }

    if (url.pathname.startsWith('/api/imd/orders/')) {
      const token = req.headers['x-personality-request-token']
      const paymentSignature = req.headers['payment-signature']
      if (paymentSignature && String(paymentSignature).length > 12288) {
        sendJson(res, 413, { error: 'payment_signature_too_large' })
        return true
      }
      const body = req.method === 'POST' && paymentSignature ? await readBody(req) : undefined
      try {
        const upstream = buildPaidUpstream({ method: req.method, pathname: url.pathname, token, paymentSignature, body })
        await relay(res, fetchImpl, upstream.target, upstream.init, PAID_RESPONSE_HEADERS)
      } catch (error) {
        if (error.message === 'Invalid request token') sendJson(res, 401, { error: 'invalid_request_token' })
        else sendJson(res, 404, { error: 'unknown_personality_route' })
      }
      return true
    }

    sendJson(res, 404, { error: 'unknown_personality_route' })
    return true
  } catch (error) {
    if (error instanceof Error && error.message === 'request_body_too_large') sendJson(res, 413, { error: error.message })
    else if (error instanceof Error && error.message.startsWith('invalid_fairlaunch_request:')) sendJson(res, 400, { error: 'invalid_fairlaunch_request', detail: error.message.split(':').slice(1).join(':') })
    else sendJson(res, 502, { error: 'imd_upstream_failed', detail: error instanceof Error ? error.message : String(error) })
    return true
  }
}
