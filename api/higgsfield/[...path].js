import { handleHiggsfieldRequest } from '../../server/higgsfield-handler.js'

export default async function handler(req, res) {
  await handleHiggsfieldRequest(req, res)
}
