import { formatUnits, sha256, stringToBytes } from 'viem'

export function canonicalJson(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function extractQuoteOrder(result) {
  const order = result?.order
  if (!order?.id || !order?.quote) throw new Error('IMD did not return a usable order')
  return order
}

export function formatPaymentAmount(amount, decimals) {
  return formatUnits(BigInt(amount), Number(decimals))
}

export function buildSpendControls(requirement) {
  if (requirement?.network !== 'eip155:1') throw new Error('Payment requirement must use Ethereum Mainnet')
  if (!/^0x[0-9a-fA-F]{40}$/.test(requirement?.asset || '') || !/^\d+$/.test(requirement?.amount || '') || BigInt(requirement.amount) <= 0n) {
    throw new Error('Invalid payment requirement')
  }
  return {
    allowedAssets: [{
      network: requirement.network,
      asset: requirement.asset,
      maxAmountPerPayment: requirement.amount,
    }],
  }
}

export function buildQuoteApproval(challenge, payment) {
  const quote = challenge?.quote
  const chainId = Number(String(quote?.payment?.network || '').replace(/^eip155:/, ''))
  if (!quote?.id || !quote?.quoteHash || !quote?.payment || !challenge?.resourceUrl || !challenge?.requesterScopeHash || !Number.isSafeInteger(chainId)) {
    throw new Error('IMD returned an invalid payment challenge')
  }
  return {
    domain: { name: 'IdentityMD Paid Action', version: '1', chainId },
    primaryType: 'QuoteApproval',
    types: {
      QuoteApproval: [
        { name: 'resource', type: 'string' },
        { name: 'requesterScopeHash', type: 'bytes32' },
        { name: 'quoteId', type: 'string' },
        { name: 'quoteHash', type: 'bytes32' },
        { name: 'paymentHash', type: 'bytes32' },
        { name: 'action', type: 'string' },
        { name: 'asset', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'payTo', type: 'address' },
        { name: 'expiresAt', type: 'uint256' },
      ],
    },
    message: {
      resource: challenge.resourceUrl,
      requesterScopeHash: `0x${challenge.requesterScopeHash}`,
      quoteId: quote.id,
      quoteHash: `0x${quote.quoteHash}`,
      paymentHash: sha256(stringToBytes(canonicalJson(payment))),
      action: quote.action,
      asset: quote.payment.asset,
      amount: BigInt(quote.payment.amount),
      payTo: quote.payment.payTo,
      expiresAt: BigInt(quote.expiresAt),
    },
  }
}

export function paymentStatusLabel(status) {
  return {
    quoted: 'QUOTE READY',
    payment_pending: 'PAYMENT PENDING',
    admission_pending: 'ADMISSION PENDING',
    admitted: 'JOB ADMITTED',
    payment_failed: 'PAYMENT FAILED',
    expired: 'QUOTE EXPIRED',
  }[status] || 'IMD STATUS'
}
