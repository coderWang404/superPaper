import Settings from '@superpaper/settings'
import OError from '@superpaper/o-error'
import { fetchJson } from '@superpaper/fetch-utils'

async function getQueues(userId) {
  try {
    return await fetchJson(`${Settings.apis.tpdsworker.url}/queues/${userId}`)
  } catch (err) {
    throw OError.tag(err, 'failed to query TPDS queues for user', { userId })
  }
}

export default {
  promises: {
    getQueues,
  },
}
