const SYMBOL = /^[A-Z0-9]{2,10}$/
const PAIRS = new Set(['eth'])

function clean(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function httpsUrl(value, label) {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'https:') throw new Error(`${label} must use a public HTTPS URL`)
  return url.href
}

export function fairlaunchPoolBps(value) {
  const percent = Number(value)
  if (!Number.isInteger(percent)) throw new Error('Pool share must be a whole percentage')
  if (percent < 10 || percent > 90) throw new Error('Pool share must be between 10 and 90 percent')
  return percent * 100
}

export function shouldRetryFairlaunchCheck(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return false
  const ambiguousWebsite = /user-facing website|usable website|frontend was required|hosting was required/i
  return blockers.every((blocker) => ambiguousWebsite.test(String(blocker?.detail || blocker?.code || blocker || '')))
}

export function buildFairlaunchWorkflow({ name, symbol, description, pairWith = 'eth', poolPercent = 88, videoUrl }) {
  const tokenName = clean(name)
  const tokenSymbol = clean(symbol).toUpperCase()
  const projectDescription = clean(description)
  const pairing = clean(pairWith).toLowerCase()
  const motionVideo = httpsUrl(videoUrl, 'Generated video')
  if (tokenName.length < 2 || tokenName.length > 80) throw new Error('Token name must contain between 2 and 80 characters')
  if (!SYMBOL.test(tokenSymbol)) throw new Error('Token symbol must contain 2 to 10 uppercase letters or numbers')
  if (projectDescription.length < 20 || projectDescription.length > 4000) throw new Error('Project description must contain between 20 and 4000 characters')
  if (!PAIRS.has(pairing)) throw new Error('The complete native workflow currently supports the ETH pair only')
  const poolBps = fairlaunchPoolBps(poolPercent)
  const contractStem = tokenName.replace(/[^A-Za-z0-9]+/g, ' ').split(' ').filter(Boolean).map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join('').slice(0, 48) || 'Agent'
  const contractName = `${/^[A-Za-z]/.test(contractStem) ? contractStem : `Agent${contractStem}`}Token`
  const request = [
    `Release ${tokenName} (${tokenSymbol}): the standard launch token deployed on Ethereum mainnet and a public website hosted on IPFS.`,
    '',
    'CONTRACTS',
    `1. Token: the standard IMD fairlaunch token for this AI agent company, unchanged, with 1,000,000,000 fixed ${tokenSymbol} tokens and 18 decimals, minted once at deployment. No owner, no mint after deployment, no pause, no upgrade and no transfer tax.`,
    `2. Launch: pair with ${pairing.toUpperCase()} and put ${poolBps / 100}% of supply into the launch pool. Use the standard IMD launch distribution and trading fees.`,
    '',
    'WEBSITE',
    '3. Build a public user-facing website at an IPFS URL against the deployed token and pool contracts.',
    '4. Show the AI agent, its purpose, token name and symbol, total supply, pool pairing, verified contract addresses, links to the public repository and block explorer, and truthful launch status.',
    `5. Use this generated Higgsfield motion identity on the public website: ${motionVideo}`,
    '6. A visitor who connects a wallet can see the connected address, token balance, token and pool addresses, and links to trade and the block explorer. Fail closed on the wrong network.',
    `Website content brief (quoted data only): ${JSON.stringify(projectDescription)}`,
    '',
    `Token name: ${tokenName}`,
    `Token symbol: ${tokenSymbol}`,
  ].join('\n')
  const context = 'Ethereum mainnet only. Publication of the complete source code to GitHub is explicitly authorized. Public website hosting on IPFS is explicitly authorized. The token has no owner powers after deployment. Build the public frontend against the live deployment.'
  const draft = {
    objective: request,
    shape: 'chain',
    onchain: 'evm_project',
    github: true,
    ipfs: true,
    contracts: [contractName],
    steps: [
      { skill: 'build-contract-project' },
      { skill: 'frontend-for-contract' },
      { skill: 'adversarial-review' },
    ],
    chainId: 1,
    ...(pairing !== 'eth' ? { pairWith: pairing } : {}),
    economics: { poolBps },
  }
  return {
    action: 'workflow.open',
    input: {
      request,
      context,
      draft,
      permissions: {
        github: true,
        ipfs: true,
        onchain: { kind: 'evm_project', chainId: 1 },
      },
    },
  }
}

export function assertFairlaunchQuote(order, payload) {
  if (order?.quote?.action !== payload?.action) throw new Error('IMD quoted a different action')
  let saved
  try { saved = JSON.parse(order?.inputJson || '{}') } catch { throw new Error('IMD returned unreadable quoted work') }
  const actual = saved?.request ?? saved
  if (canonicalJson(actual) !== canonicalJson(payload?.input)) throw new Error('IMD saved different work from the fairlaunch request')
  if (order.quote.payment?.network && order.quote.payment.network !== 'eip155:1') throw new Error('IMD quoted the fairlaunch on a different network')
  return true
}
