import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFairlaunchWorkflow,
  assertFairlaunchQuote,
  fairlaunchPoolBps,
} from '../src/imd-launch.js'
import { validateImdRequestBody } from '../server/imd-fairlaunch.js'
import { handleImdRequest } from '../server/imd-handler.js'

test('fairlaunch pool share is constrained to the official 10 to 90 percent range', () => {
  assert.equal(fairlaunchPoolBps(10), 1000)
  assert.equal(fairlaunchPoolBps(88), 8800)
  assert.equal(fairlaunchPoolBps(90), 9000)
  assert.throws(() => fairlaunchPoolBps(9), /between 10 and 90/i)
  assert.throws(() => fairlaunchPoolBps(90.5), /whole percentage/i)
})

test('native fairlaunch builds the official workflow open request for Ethereum mainnet', () => {
  const payload = buildFairlaunchWorkflow({
    name: 'Nova Agent',
    symbol: 'NOVA',
    description: 'An autonomous culture and media agent with a consistent visual identity.',
    pairWith: 'eth',
    poolPercent: 88,
    videoUrl: 'https://cdn.example.com/nova.mp4',
  })
  assert.equal(payload.action, 'workflow.open')
  assert.equal(payload.input.draft.chainId, 1)
  assert.equal(payload.input.draft.onchain, 'evm_project')
  assert.equal(payload.input.draft.github, true)
  assert.equal(payload.input.draft.ipfs, true)
  assert.equal(payload.input.draft.pairWith, undefined)
  assert.equal(payload.input.draft.economics.poolBps, 8800)
  assert.match(payload.input.request, /Token name: Nova Agent/)
  assert.match(payload.input.request, /Token symbol: NOVA/)
  assert.match(payload.input.request, /https:\/\/cdn\.example\.com\/nova\.mp4/)
  assert.deepEqual(payload.input.permissions.onchain, { kind: 'evm_project', chainId: 1 })
  assert.deepEqual(payload.input.draft.contracts, ['NovaAgentToken'])
  assert.deepEqual(buildFairlaunchWorkflow({ name: '100 Agents', symbol: 'HUNDRED', description: 'A complete autonomous agent project description.', pairWith: 'eth', poolPercent: 88, videoUrl: 'https://cdn.example.com/100.mp4' }).input.draft.contracts, ['Agent100AgentsToken'])
})

test('fairlaunch rejects malformed symbols descriptions pairings and media URLs', () => {
  const base = { name: 'Nova Agent', symbol: 'NOVA', description: 'A complete autonomous agent project description.', pairWith: 'eth', poolPercent: 88, videoUrl: 'https://cdn.example.com/nova.mp4' }
  assert.throws(() => buildFairlaunchWorkflow({ ...base, symbol: 'bad symbol' }), /symbol/i)
  assert.throws(() => buildFairlaunchWorkflow({ ...base, description: 'short' }), /description/i)
  assert.throws(() => buildFairlaunchWorkflow({ ...base, pairWith: 'usdc' }), /pair/i)
  assert.throws(() => buildFairlaunchWorkflow({ ...base, videoUrl: 'http://localhost/nova.mp4' }), /HTTPS/i)
})

test('fairlaunch verifies that IMD quoted the same workflow request', () => {
  const payload = buildFairlaunchWorkflow({ name: 'Nova Agent', symbol: 'NOVA', description: 'A complete autonomous agent project description.', pairWith: 'eth', poolPercent: 88, videoUrl: 'https://cdn.example.com/nova.mp4' })
  const order = { quote: { action: 'workflow.open', payment: { network: 'eip155:1' } }, inputJson: JSON.stringify({ request: payload.input }) }
  assert.equal(assertFairlaunchQuote(order, payload), true)
  assert.throws(() => assertFairlaunchQuote({ ...order, inputJson: JSON.stringify({ request: { ...payload.input, request: 'different' } }) }, payload), /different work/i)
  assert.throws(() => assertFairlaunchQuote({ ...order, inputJson: JSON.stringify({ request: { ...payload.input, draft: { ...payload.input.draft, economics: { poolBps: 1000 } } } }) }, payload), /different work/i)
  assert.throws(() => assertFairlaunchQuote({ ...order, quote: { action: 'job.open' } }, payload), /different action/i)
  assert.throws(() => assertFairlaunchQuote({ ...order, quote: { action: 'workflow.open', payment: { network: 'eip155:8453' } } }, payload), /different network/i)
})

test('server accepts only the constrained native fairlaunch workflow', () => {
  const payload = buildFairlaunchWorkflow({ name: 'Nova Agent', symbol: 'NOVA', description: 'A complete autonomous agent project description.', pairWith: 'eth', poolPercent: 88, videoUrl: 'https://cdn.example.com/nova.mp4' })
  assert.deepEqual(JSON.parse(validateImdRequestBody(JSON.stringify(payload))), payload)
  const quoted = { ...payload, requestKey: '2ff6e5d5-50dc-4ef0-b1ca-4ff81f793ceb' }
  assert.deepEqual(JSON.parse(validateImdRequestBody(JSON.stringify(quoted), { requireRequestKey: true })), quoted)
  assert.throws(() => validateImdRequestBody(JSON.stringify({ ...payload, input: { ...payload.input, draft: { ...payload.input.draft, chainId: 8453 } } })), /draft_configuration/)
  assert.throws(() => validateImdRequestBody(JSON.stringify({ ...payload, input: { ...payload.input, draft: { ...payload.input.draft, economics: { poolBps: 9050 } } } })), /pool_bps/)
  assert.throws(() => validateImdRequestBody(JSON.stringify({ ...payload, input: { ...payload.input, draft: { ...payload.input.draft, objective: 'A different workflow objective that should never be accepted.' } } })), /objective_mismatch/)
  assert.throws(() => validateImdRequestBody(JSON.stringify({ ...payload, input: { ...payload.input, permissions: { ...payload.input.permissions, onchain: { kind: 'evm_project', chainId: 8453 } } } })), /permissions/)
  assert.throws(() => validateImdRequestBody(JSON.stringify({ ...payload, unexpected: true })), /root_field/)
  assert.throws(() => validateImdRequestBody(JSON.stringify(payload), { requireRequestKey: true }), /request_key/)
  const original = JSON.stringify({ action: 'job.open', input: { objective: 'unchanged original creator request' } })
  assert.equal(validateImdRequestBody(original), original)
})

test('server relays only UUID-shaped public workflow status reads', async () => {
  const calls = []
  const response = () => ({
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    end(value) { this.body = value },
  })
  const id = '805e6ace-52ea-4156-a433-fd9d1db231e5'
  const res = response()
  await handleImdRequest({ method: 'GET', url: `/api/imd/workflows/${id}`, headers: {} }, res, {
    fetchImpl: async (target) => {
      calls.push(target)
      return new Response(JSON.stringify({ id, status: 'contracts' }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(calls[0], `https://api.imd.fun/workflows/${id}`)
  const rejected = response()
  await handleImdRequest({ method: 'GET', url: '/api/imd/workflows/not-an-id', headers: {} }, rejected, { fetchImpl: async () => { throw new Error('must not relay') } })
  assert.equal(rejected.statusCode, 400)
})
