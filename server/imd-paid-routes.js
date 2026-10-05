const IMD_API = 'https://api.imd.fun'
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}'
const ORDER_ROUTE = new RegExp(`^/api/imd/orders/(${UUID})(/submit)?$`)

export const PAID_RESPONSE_HEADERS = ['payment-required', 'payment-response', 'retry-after']

export function buildPaidUpstream({ method, pathname, token, paymentSignature, body }) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) throw new Error('Invalid request token')
  const match = pathname.match(ORDER_ROUTE)
  if (!match) throw new Error('Unknown paid route')
  const [, orderId, submitSuffix] = match
  const isSubmit = submitSuffix === '/submit'
  if ((!isSubmit && method !== 'GET') || (isSubmit && method !== 'POST')) throw new Error('Unknown paid route')

  const headers = { accept: 'application/json', authorization: `Bearer ${token}` }
  const init = { method, headers }
  if (isSubmit && paymentSignature) {
    headers['content-type'] = 'application/json'
    headers['PAYMENT-SIGNATURE'] = paymentSignature
    init.body = body || '{}'
  }
  return {
    target: `${IMD_API}/requests/${orderId}${isSubmit ? '/submit' : ''}`,
    init,
  }
}
