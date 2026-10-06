import { readFile } from 'node:fs/promises'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createPublicClient, formatUnits, getAddress, http, parseUnits, verifyMessage } from 'viem'
import { mainnet } from 'viem/chains'

const DEFAULT_ENV_PATH = join(homedir(), 'Desktop', 'PersonalityMD_HIGGSFIELD.env')
const DEFAULT_RPC_URL = 'https://ethereum.publicnode.com'
const UPLOAD_ENDPOINT = 'https://api.higgsfield.ai/files/generate-upload-url'
const MOTION_ENDPOINT = 'https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0'
const STATUS_ROOT = 'https://api.higgsfield.ai/requests'
const MAX_BODY_BYTES = 64 * 1024
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const SESSION_TTL_MS = 20 * 60 * 1000
const JOB_TTL_MS = 30 * 60 * 1000
const erc20Abi = [
  { type: 'function', stateMutability: 'view', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', stateMutability: 'view', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
]

export function parseEnvText(text = '') {
  const values = {}
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    values[key] = value
  }
  return values
}

export function parseCredentials(value = '') {
  const separator = String(value).indexOf(':')
  if (separator < 1 || separator === value.length - 1) throw new Error('Higgsfield credentials must contain a key id and secret')
  return { keyId: value.slice(0, separator), keySecret: value.slice(separator + 1) }
}
export function qualifiesForHolderGate(balance, minimum, decimals) { return BigInt(balance) >= parseUnits(String(minimum), Number(decimals)) }
export function buildHolderChallenge({ address, nonce, expiresAt }) {
  return ['Personality.md Higgsfield holder access', '', `Wallet: ${address}`, 'Network: Ethereum Mainnet', 'Action: prove wallet ownership for a read-only PMD balance check', `Nonce: ${nonce}`, `Expires: ${new Date(expiresAt).toISOString()}`, '', 'This signature does not authorize a transaction or payment.'].join('\n')
}
export function sanitizePrompt(value = '') {
  const prompt = String(value).replace(/\s+/g, ' ').trim()
  if (!prompt) throw new Error('A generation prompt is required')
  return prompt.slice(0, 2000)
}
export function validateUploadRequest({ kind, contentType, size }) {
  const normalizedKind = String(kind || '').toLowerCase()
  const normalizedType = String(contentType || '').toLowerCase().split(';')[0].trim()
  const allowedImages = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])
  const maxBytes = normalizedKind === 'image' ? 15 * 1024 * 1024 : normalizedKind === 'video' ? 50 * 1024 * 1024 : 0
  if (!maxBytes) throw new Error('Upload kind must be image or video')
  if (normalizedKind === 'image' && !allowedImages.has(normalizedType)) throw new Error('Reference image must be JPEG PNG WEBP or GIF')
  if (normalizedKind === 'video' && normalizedType !== 'video/mp4') throw new Error('Reference video must be MP4')
  if (!Number.isFinite(Number(size)) || Number(size) < 1) throw new Error('Upload is empty')
  if (Number(size) > maxBytes) throw new Error(`${normalizedKind} upload is too large`)
  return { kind: normalizedKind, contentType: normalizedType, maxBytes }
}
export function validateMp4Duration(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || [])
  if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Could not read a valid MP4 duration')
  function findMvhd(start, end) {
    let offset = start
    while (offset + 8 <= end) {
      let size = buffer.readUInt32BE(offset)
      const type = buffer.toString('ascii', offset + 4, offset + 8)
      let headerSize = 8
      if (size === 1) {
        if (offset + 16 > end) return null
        const extended = buffer.readBigUInt64BE(offset + 8)
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return null
        size = Number(extended); headerSize = 16
      } else if (size === 0) size = end - offset
      if (size < headerSize || offset + size > end) return null
      if (type === 'mvhd') return { offset, size, headerSize }
      if (type === 'moov') { const nested = findMvhd(offset + headerSize, offset + size); if (nested) return nested }
      offset += size
    }
    return null
  }
  const box = findMvhd(0, buffer.length)
  if (!box) throw new Error('Could not read a valid MP4 duration')
  const payload = box.offset + box.headerSize
  const version = buffer[payload]
  let timescale, duration
  if (version === 0 && payload + 20 <= box.offset + box.size) {
    timescale = buffer.readUInt32BE(payload + 12); duration = buffer.readUInt32BE(payload + 16)
  } else if (version === 1 && payload + 32 <= box.offset + box.size) {
    timescale = buffer.readUInt32BE(payload + 20)
    const rawDuration = buffer.readBigUInt64BE(payload + 24)
    if (rawDuration > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Could not read a valid MP4 duration')
    duration = Number(rawDuration)
  } else throw new Error('Could not read a valid MP4 duration')
  const seconds = duration / timescale
  if (!timescale || !Number.isFinite(seconds) || seconds <= 0) throw new Error('Could not read a valid MP4 duration')
  if (seconds > 5.05) throw new Error('Motion reference must be no longer than 5 seconds')
  return seconds
}
export function buildMotionTransferPayload({ prompt = '', imageUrl, videoUrl }) {
  return { prompt: String(prompt).replace(/\s+/g, ' ').trim().slice(0, 10000), image_urls: [assertHttpsUrl(imageUrl, 'image')], video_url: assertHttpsUrl(videoUrl, 'video'), resolution: '720p' }
}
export function signCapability(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${createHmac('sha256', String(secret)).update(encoded).digest('base64url')}`
}
export function verifyCapability(token, secret, expectedType, now = Date.now()) {
  const [encoded, signature, extra] = String(token || '').split('.')
  if (!encoded || !signature || extra) throw new Error('invalid_capability')
  const expected = createHmac('sha256', String(secret)).update(encoded).digest()
  let supplied
  try { supplied = Buffer.from(signature, 'base64url') } catch { throw new Error('invalid_capability') }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('invalid_capability')
  let payload
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) } catch { throw new Error('invalid_capability') }
  if (!payload || payload.type !== expectedType || !Number.isFinite(Number(payload.exp))) throw new Error('invalid_capability')
  if (Number(payload.exp) <= now) throw new Error('expired_capability')
  return payload
}
function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(body))
}
async function readJson(req) {
  const chunks = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY_BYTES) throw new Error('request_body_too_large'); chunks.push(chunk) }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('invalid_json') }
}
async function loadConfig(envPath = DEFAULT_ENV_PATH) {
  let values = { ...process.env }
  if (!values.HIGGSFIELD_API_KEY) {
    try { values = { ...values, ...parseEnvText(await readFile(envPath, 'utf8')) } } catch { throw new Error('Higgsfield server configuration is unavailable') }
  }
  const credentials = parseCredentials(values.HIGGSFIELD_API_KEY)
  const tokenAddress = getAddress(values.HOLDER_TOKEN_ADDRESS || '0xc786cbf210e3ba8a5a45786356b859b8082c9d72')
  const minimum = values.HOLDER_MIN_BALANCE || '100000'; const chainId = Number(values.HOLDER_CHAIN_ID || '1')
  if (chainId !== 1) throw new Error('Holder gate must use Ethereum Mainnet')
  return { credentials, tokenAddress, minimum, chainId, chainName: values.HOLDER_CHAIN_NAME || 'Ethereum Mainnet', launcherUrl: values.SWARM_LAUNCH_URL || 'https://explorer.imd.fun/launch', rpcUrl: values.ETHEREUM_RPC_URL || DEFAULT_RPC_URL }
}
function authHeader(credentials) { return `Key ${credentials.keyId}:${credentials.keySecret}` }
function bearerToken(req) { const header = String(req.headers.authorization || ''); return header.startsWith('Bearer ') ? header.slice(7) : '' }
function requireSession(req, config, now) { const session = verifyCapability(bearerToken(req), config.credentials.keySecret, 'session', now); return { ...session, address: getAddress(session.address) } }
async function upstreamJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init); const text = await response.text(); let result = {}
  try { result = text ? JSON.parse(text) : {} } catch { result = {} }
  if (!response.ok) { const detail = result?.detail || result?.message || result?.error?.message || result?.error || `Higgsfield returned ${response.status}`; const error = new Error(String(detail).slice(0, 500)); error.status = response.status; throw error }
  return result
}
function assertHttpsUrl(value, label = 'media') { const url = new URL(String(value)); if (url.protocol !== 'https:') throw new Error(`A public HTTPS ${label} URL is required`); return url.href }
async function downloadBuffer(fetchImpl, url, maxBytes) {
  const response = await fetchImpl(url, { headers: { accept: 'video/mp4,application/octet-stream' } })
  if (!response.ok || !response.body) throw new Error('Could not validate the uploaded motion reference')
  if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('video upload is too large')
  const chunks = []; let size = 0
  for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) throw new Error('video upload is too large'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}

export async function handleHiggsfieldRequest(req, res, options = {}) {
  const url = new URL(req.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/higgsfield/')) return false
  const now = options.now?.() ?? Date.now(); const fetchImpl = options.fetchImpl || fetch
  try {
    const config = await loadConfig(options.envPath); const secret = config.credentials.keySecret
    if (req.method === 'GET' && url.pathname === '/api/higgsfield/config') {
      sendJson(res, 200, { provider: 'Higgsfield', imageModel: 'User reference image', videoModel: 'Genjutsu Motion Transfer', tokenAddress: config.tokenAddress, minimum: config.minimum, chainId: config.chainId, chainName: config.chainName, launcherUrl: config.launcherUrl }); return true
    }
    if (req.method === 'POST' && url.pathname === '/api/higgsfield/challenge') {
      const body = await readJson(req); const address = getAddress(String(body.address || '')); const expiresAt = now + CHALLENGE_TTL_MS
      const message = buildHolderChallenge({ address, nonce: randomBytes(16).toString('hex'), expiresAt }); const challengeToken = signCapability({ type: 'challenge', address, message, exp: expiresAt }, secret)
      sendJson(res, 200, { address, message, challengeToken, expiresAt }); return true
    }
    if (req.method === 'POST' && url.pathname === '/api/higgsfield/verify') {
      const body = await readJson(req); const address = getAddress(String(body.address || '')); const challenge = verifyCapability(body.challengeToken, secret, 'challenge', now)
      if (getAddress(challenge.address) !== address || !await verifyMessage({ address, message: String(challenge.message), signature: String(body.signature || '') })) throw new Error('wallet_signature_invalid')
      const client = createPublicClient({ chain: mainnet, transport: http(config.rpcUrl, { timeout: 20_000 }) })
      const [decimals, balance] = await Promise.all([client.readContract({ address: config.tokenAddress, abi: erc20Abi, functionName: 'decimals' }), client.readContract({ address: config.tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [address] })])
      if (!qualifiesForHolderGate(balance, config.minimum, decimals)) { sendJson(res, 403, { eligible: false, address, balance: formatUnits(balance, decimals), minimum: config.minimum, decimals }); return true }
      const expiresAt = now + SESSION_TTL_MS; const token = signCapability({ type: 'session', address, exp: expiresAt }, secret)
      sendJson(res, 200, { eligible: true, address, balance: formatUnits(balance, decimals), minimum: config.minimum, decimals, token, expiresAt }); return true
    }
    if (req.method === 'POST' && url.pathname === '/api/higgsfield/upload-ticket') {
      const session = requireSession(req, config, now); const uploadRequest = await readJson(req); const upload = validateUploadRequest(uploadRequest)
      const ticket = await upstreamJson(fetchImpl, UPLOAD_ENDPOINT, { method: 'POST', headers: { authorization: authHeader(config.credentials), 'content-type': 'application/json' }, body: JSON.stringify({ content_type: upload.contentType }) })
      const uploadUrl = assertHttpsUrl(ticket.upload_url, 'upload'); const publicUrl = assertHttpsUrl(ticket.public_url, upload.kind)
      const uploadHeaders = ticket.upload_headers && typeof ticket.upload_headers === 'object' ? ticket.upload_headers : { 'Content-Type': upload.contentType }
      const receipt = signCapability({ type: 'upload', address: session.address, kind: upload.kind, contentType: upload.contentType, size: Number(uploadRequest.size), publicUrl, exp: session.exp }, secret)
      sendJson(res, 201, { kind: upload.kind, uploadUrl, uploadHeaders, publicUrl, receipt }); return true
    }
    if (req.method === 'POST' && url.pathname === '/api/higgsfield/generate-motion') {
      const session = requireSession(req, config, now); const body = await readJson(req)
      const image = verifyCapability(body.imageReceipt, secret, 'upload', now); const video = verifyCapability(body.videoReceipt, secret, 'upload', now)
      if (getAddress(image.address) !== session.address || getAddress(video.address) !== session.address || image.kind !== 'image' || video.kind !== 'video') throw new Error('reference_upload_required')
      validateMp4Duration(await downloadBuffer(fetchImpl, assertHttpsUrl(video.publicUrl, 'video'), 50 * 1024 * 1024))
      const payload = buildMotionTransferPayload({ prompt: body.prompt, imageUrl: image.publicUrl, videoUrl: video.publicUrl })
      const result = await upstreamJson(fetchImpl, MOTION_ENDPOINT, { method: 'POST', headers: { authorization: authHeader(config.credentials), 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(payload) })
      if (!result.request_id) throw new Error('Higgsfield did not return a job id')
      const jobToken = signCapability({ type: 'job', address: session.address, requestId: result.request_id, exp: now + JOB_TTL_MS }, secret)
      sendJson(res, 202, { status: result.status, requestId: result.request_id, jobToken }); return true
    }
    if (req.method === 'GET' && url.pathname === '/api/higgsfield/status') {
      const session = requireSession(req, config, now); const job = verifyCapability(url.searchParams.get('job'), secret, 'job', now); const requestId = String(job.requestId || '')
      if (getAddress(job.address) !== session.address || !/^[0-9a-z-]{8,80}$/i.test(requestId)) throw new Error('unknown_higgsfield_job')
      sendJson(res, 200, await upstreamJson(fetchImpl, `${STATUS_ROOT}/${encodeURIComponent(requestId)}/status`, { headers: { authorization: authHeader(config.credentials), accept: 'application/json' } })); return true
    }
    sendJson(res, 404, { error: 'unknown_higgsfield_route' }); return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const clientErrors = new Set(['invalid_json', 'request_body_too_large', 'wallet_signature_invalid', 'unknown_higgsfield_job', 'invalid_capability', 'expired_capability', 'A generation prompt is required', 'A public HTTPS image URL is required', 'A public HTTPS video URL is required', 'reference_upload_required', 'Upload is empty', 'Reference video must be MP4', 'Reference image must be JPEG PNG WEBP or GIF', 'image upload is too large', 'video upload is too large', 'Upload kind must be image or video', 'Could not read a valid MP4 duration', 'Motion reference must be no longer than 5 seconds', 'Could not validate the uploaded motion reference'])
    const status = ['invalid_capability', 'expired_capability'].includes(message) ? 401 : clientErrors.has(message) ? 400 : Number(error?.status) || 502
    sendJson(res, status, { error: message }); return true
  }
}
