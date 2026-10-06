import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHolderChallenge,
  parseCredentials,
  parseEnvText,
  qualifiesForHolderGate,
  sanitizePrompt,
  validateUploadRequest,
  validateMp4Duration,
  buildMotionTransferPayload,
  signCapability,
  verifyCapability,
} from '../server/higgsfield-handler.js'

test('parses the external env without exposing or rewriting values', () => {
  const parsed = parseEnvText('HIGGSFIELD_API_KEY=id:secret\nHOLDER_MIN_BALANCE=100000\n# ignored\n')
  assert.equal(parsed.HIGGSFIELD_API_KEY, 'id:secret')
  assert.equal(parsed.HOLDER_MIN_BALANCE, '100000')
})

test('requires the Higgsfield key id and secret bundle', () => {
  assert.deepEqual(parseCredentials('key-id:key-secret'), { keyId: 'key-id', keySecret: 'key-secret' })
  assert.throws(() => parseCredentials('only-one-part'), /key id and secret/i)
})

test('holder gate compares exact integer units at token decimals', () => {
  assert.equal(qualifiesForHolderGate(100000000000000000000000n, '100000', 18), true)
  assert.equal(qualifiesForHolderGate(99999999999999999999999n, '100000', 18), false)
})

test('wallet challenge binds origin address nonce and expiry', () => {
  const challenge = buildHolderChallenge({
    address: '0x1111111111111111111111111111111111111111',
    nonce: 'abc123',
    expiresAt: 2000000000000,
  })
  assert.match(challenge, /Personality\.md Higgsfield holder access/)
  assert.match(challenge, /0x1111111111111111111111111111111111111111/)
  assert.match(challenge, /abc123/)
  assert.match(challenge, /Ethereum Mainnet/)
})

test('prompt cleanup is bounded and rejects empty input', () => {
  assert.equal(sanitizePrompt('  cinematic   portrait  '), 'cinematic portrait')
  assert.throws(() => sanitizePrompt('   '), /prompt/i)
  assert.equal(sanitizePrompt('x'.repeat(5000)).length, 2000)
})

test('reference upload accepts one supported image and one mp4 within size limits', () => {
  assert.deepEqual(validateUploadRequest({ kind: 'image', contentType: 'image/png', size: 1024 }), { kind: 'image', contentType: 'image/png', maxBytes: 15 * 1024 * 1024 })
  assert.deepEqual(validateUploadRequest({ kind: 'video', contentType: 'video/mp4', size: 2048 }), { kind: 'video', contentType: 'video/mp4', maxBytes: 50 * 1024 * 1024 })
  assert.throws(() => validateUploadRequest({ kind: 'video', contentType: 'video/quicktime', size: 2048 }), /mp4/i)
  assert.throws(() => validateUploadRequest({ kind: 'image', contentType: 'image/png', size: 16 * 1024 * 1024 }), /too large/i)
})

function mp4WithDuration(seconds, timescale = 1000) {
  const ftyp = Buffer.alloc(16)
  ftyp.writeUInt32BE(16, 0)
  ftyp.write('ftyp', 4, 'ascii')
  ftyp.write('isom', 8, 'ascii')
  const mvhd = Buffer.alloc(32)
  mvhd.writeUInt32BE(32, 0)
  mvhd.write('mvhd', 4, 'ascii')
  mvhd.writeUInt32BE(timescale, 20)
  mvhd.writeUInt32BE(Math.round(seconds * timescale), 24)
  const moov = Buffer.alloc(8 + mvhd.length)
  moov.writeUInt32BE(moov.length, 0)
  moov.write('moov', 4, 'ascii')
  mvhd.copy(moov, 8)
  return Buffer.concat([ftyp, moov])
}

test('server validates that the MP4 motion reference is no longer than five seconds', () => {
  assert.equal(validateMp4Duration(mp4WithDuration(5)), 5)
  assert.equal(validateMp4Duration(mp4WithDuration(1.25)), 1.25)
  assert.throws(() => validateMp4Duration(mp4WithDuration(5.2)), /no longer than 5 seconds/i)
  assert.throws(() => validateMp4Duration(Buffer.from('not an mp4')), /valid MP4 duration/i)
})

test('motion transfer requires one public image and one public video', () => {
  assert.deepEqual(buildMotionTransferPayload({
    prompt: 'subtle movement',
    imageUrl: 'https://cdn.example.com/person.png',
    videoUrl: 'https://cdn.example.com/motion.mp4',
  }), {
    prompt: 'subtle movement',
    image_urls: ['https://cdn.example.com/person.png'],
    video_url: 'https://cdn.example.com/motion.mp4',
    resolution: '720p',
  })
  assert.throws(() => buildMotionTransferPayload({ prompt: 'x', imageUrl: 'http://localhost/a.png', videoUrl: 'https://cdn.example.com/v.mp4' }), /HTTPS image/i)
})

test('production capabilities are signed statelessly and reject tampering or expiry', () => {
  const secret = 'test-only-secret'
  const token = signCapability({ type: 'session', address: '0x1111111111111111111111111111111111111111', exp: 2000 }, secret)
  assert.equal(verifyCapability(token, secret, 'session', 1000).address, '0x1111111111111111111111111111111111111111')
  assert.throws(() => verifyCapability(`${token}x`, secret, 'session', 1000), /invalid_capability/i)
  assert.throws(() => verifyCapability(token, secret, 'session', 2001), /expired_capability/i)
  assert.throws(() => verifyCapability(token, secret, 'job', 1000), /invalid_capability/i)
})
