const ALLOWED_STEPS = ['build-contract-project', 'frontend-for-contract', 'adversarial-review']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function fail(message) {
  throw new Error(`invalid_fairlaunch_request:${message}`)
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_object`)
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) fail(`${label}_field_${unknown[0]}`)
}

export function validateImdRequestBody(rawBody, { requireRequestKey = false } = {}) {
  let body
  try { body = JSON.parse(rawBody) } catch { fail('json') }
  if (body?.action !== 'workflow.open') return rawBody

  exactKeys(body, requireRequestKey ? ['action', 'input', 'requestKey'] : ['action', 'input'], 'root')
  if (requireRequestKey && !UUID.test(String(body.requestKey || ''))) fail('request_key')
  exactKeys(body.input, ['request', 'context', 'draft', 'permissions'], 'input')
  if (typeof body.input.request !== 'string' || body.input.request.length < 20 || body.input.request.length > 8000) fail('request')
  if (typeof body.input.context !== 'string' || body.input.context.length < 20 || body.input.context.length > 1000) fail('context')

  const motionMatch = body.input.request.match(/Higgsfield motion identity[^:\n]*:\s*(https:\/\/\S+)/i)
  if (!motionMatch) fail('motion_reference')
  try {
    const motion = new URL(motionMatch[1])
    if (motion.protocol !== 'https:') fail('motion_reference')
  } catch { fail('motion_reference') }

  const draft = body.input.draft
  exactKeys(draft, ['objective', 'shape', 'onchain', 'github', 'ipfs', 'contracts', 'steps', 'chainId', 'pairWith', 'economics'], 'draft')
  if (typeof draft.objective !== 'string' || draft.objective.length < 20 || draft.objective.length > 8000) fail('objective')
  if (draft.objective !== body.input.request) fail('objective_mismatch')
  if (draft.shape !== 'chain' || draft.onchain !== 'evm_project' || draft.github !== true || draft.ipfs !== true || draft.chainId !== 1) fail('draft_configuration')
  if (draft.pairWith !== undefined) fail('pair')
  if (!Array.isArray(draft.contracts) || draft.contracts.length !== 1 || !/^[A-Za-z][A-Za-z0-9]{1,63}$/.test(draft.contracts[0])) fail('contracts')
  exactKeys(draft.economics, ['poolBps'], 'economics')
  if (!Number.isInteger(draft.economics.poolBps) || draft.economics.poolBps < 1000 || draft.economics.poolBps > 9000) fail('pool_bps')
  if (!Array.isArray(draft.steps) || draft.steps.length !== ALLOWED_STEPS.length || draft.steps.some((step, index) => {
    exactKeys(step, ['skill'], `step_${index}`)
    return step.skill !== ALLOWED_STEPS[index]
  })) fail('steps')

  const permissions = body.input.permissions
  exactKeys(permissions, ['github', 'ipfs', 'onchain'], 'permissions')
  exactKeys(permissions.onchain, ['kind', 'chainId'], 'permissions_onchain')
  if (permissions.github !== true || permissions.ipfs !== true || permissions.onchain.kind !== 'evm_project' || permissions.onchain.chainId !== 1) fail('permissions')

  return JSON.stringify(body)
}
