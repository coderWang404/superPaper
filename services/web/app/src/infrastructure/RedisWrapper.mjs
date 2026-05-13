import Settings from '@superpaper/settings'
import redis from '@superpaper/redis-wrapper'
import { addConnectionDrainer } from './GracefulShutdown.mjs'

/**
 * A per-feature interface to Redis, looks up the feature in `settings.redis`
 * and returns an appropriate client.  Necessary because we don't want to
 * migrate web over to redis-cluster all at once.
 *
 * @param feature - one of 'websessions' | 'ratelimiter' | ...
 */
function client(feature) {
  const redisFeatureSettings = Settings.redis[feature] || Settings.redis.web
  const client = redis.createClient(redisFeatureSettings)
  addConnectionDrainer(`redis ${feature}`, async () => {
    await client.disconnect()
  })
  return client
}

async function cleanupTestRedis() {
  const rclient = client()
  await redis.cleanupTestRedis(rclient)
}

export default { client, cleanupTestRedis }
