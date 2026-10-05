import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSpendControls,
  buildQuoteApproval,
  canonicalJson,
  extractQuoteOrder,
  formatPaymentAmount,
  paymentStatusLabel,
} from '../src/imd-payment.js'
import { buildPaidUpstream } from '../server/imd-paid-routes.js'

test('canonicalJson sorts every object level without whitespace', () => {
  const value = { z: 2, a: { y: true, b: 'x' }, list: [{ d: 4, c: 3 }] }
  assert.equal(canonicalJson(value), '{"a":{"b":"x","y":true},"list":[{"c":3,"d":4}],"z":2}')
})

test('extractQuoteOrder reads the real nested IMD quote response', () => {
  const order = extractQuoteOrder({ created: true, order: { id: '11111111-1111-4111-8111-111111111111', status: 'quoted', quote: { id: 'q1' } } })
  assert.equal(order.id, '11111111-1111-4111-8111-111111111111')
  assert.equal(order.status, 'quoted')
})

test('extractQuoteOrder rejects a response without a usable order', () => {
  assert.throws(() => extractQuoteOrder({ created: true }), /usable order/i)
})

test('formatPaymentAmount formats token units without floating point arithmetic', () => {
  assert.equal(formatPaymentAmount('500000000000000000', 18), '0.5')
  assert.equal(formatPaymentAmount('1200000', 6), '1.2')
})

test('buildSpendControls allowlists only the quoted IMD token and exact amount', () => {
  const requirement = {
    network: 'eip155:1',
    asset: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7',
    amount: '500000000000000000',
  }
  assert.deepEqual(buildSpendControls(requirement), {
    allowedAssets: [{
      network: requirement.network,
      asset: requirement.asset,
      maxAmountPerPayment: requirement.amount,
    }],
  })
  assert.throws(() => buildSpendControls({ ...requirement, network: 'eip155:8453' }), /ethereum mainnet/i)
  assert.throws(() => buildSpendControls({ ...requirement, amount: '0' }), /invalid payment requirement/i)
})

test('buildQuoteApproval binds the approval to the exact canonical payment', () => {
  const challenge = {
    resourceUrl: 'https://api.imd.fun/requests/order-1/submit',
    requesterScopeHash: '11'.repeat(32),
    quote: {
      id: 'quote-1',
      quoteHash: '22'.repeat(32),
      action: 'job.open',
      expiresAt: 1790000000,
      payment: {
        network: 'eip155:1',
        asset: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7',
        amount: '500000000000000000',
        payTo: '0x4e0fa57bde726079356537e2f34d671e9f41adbc',
      },
    },
  }
  const payment = {
    x402Version: 2,
    accepted: { scheme: 'exact', network: 'eip155:1', amount: '500000000000000000' },
    payload: { signature: '0x1234' },
  }
  const approval = buildQuoteApproval(challenge, payment)
  assert.equal(approval.domain.chainId, 1)
  assert.equal(approval.primaryType, 'QuoteApproval')
  assert.equal(approval.message.resource, challenge.resourceUrl)
  assert.equal(approval.message.requesterScopeHash, `0x${challenge.requesterScopeHash}`)
  assert.equal(approval.message.quoteHash, `0x${challenge.quote.quoteHash}`)
  assert.match(approval.message.paymentHash, /^0x[0-9a-f]{64}$/)
  assert.equal(approval.message.amount, 500000000000000000n)
})

test('paymentStatusLabel exposes admitted work without claiming early success', () => {
  assert.equal(paymentStatusLabel('quoted'), 'QUOTE READY')
  assert.equal(paymentStatusLabel('payment_pending'), 'PAYMENT PENDING')
  assert.equal(paymentStatusLabel('admission_pending'), 'ADMISSION PENDING')
  assert.equal(paymentStatusLabel('admitted'), 'JOB ADMITTED')
  assert.equal(paymentStatusLabel('payment_failed'), 'PAYMENT FAILED')
})

test('buildPaidUpstream creates the challenge request with the client token', () => {
  const request = buildPaidUpstream({ method: 'POST', pathname: '/api/imd/orders/11111111-1111-4111-8111-111111111111/submit', token: 'a'.repeat(64), body: '' })
  assert.equal(request.target, 'https://api.imd.fun/requests/11111111-1111-4111-8111-111111111111/submit')
  assert.equal(request.init.headers.authorization, `Bearer ${'a'.repeat(64)}`)
  assert.equal(request.init.method, 'POST')
})

test('buildPaidUpstream forwards the payment signature only for a paid submit', () => {
  const request = buildPaidUpstream({ method: 'POST', pathname: '/api/imd/orders/11111111-1111-4111-8111-111111111111/submit', token: 'b'.repeat(64), paymentSignature: 'base64-payment', body: '{"quoteSignature":"0x1234"}' })
  assert.equal(request.init.headers['PAYMENT-SIGNATURE'], 'base64-payment')
  assert.equal(request.init.body, '{"quoteSignature":"0x1234"}')
})

test('buildPaidUpstream supports status reads and rejects malformed order ids', () => {
  const status = buildPaidUpstream({ method: 'GET', pathname: '/api/imd/orders/11111111-1111-4111-8111-111111111111', token: 'c'.repeat(64) })
  assert.equal(status.target, 'https://api.imd.fun/requests/11111111-1111-4111-8111-111111111111')
  assert.throws(() => buildPaidUpstream({ method: 'GET', pathname: '/api/imd/orders/not-an-id', token: 'c'.repeat(64) }), /unknown paid route/i)
})

test('buildPaidUpstream rejects an invalid client token', () => {
  assert.throws(() => buildPaidUpstream({ method: 'GET', pathname: '/api/imd/orders/11111111-1111-4111-8111-111111111111', token: 'bad' }), /invalid request token/i)
})
