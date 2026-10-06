import { handleImdRequest } from '../../../server/imd-handler.js'

export default async function handler(req, res) {
  await handleImdRequest(req, res)
}
