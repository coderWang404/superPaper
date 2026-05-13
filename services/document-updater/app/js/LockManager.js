const Settings = require('@superpaper/settings')
const redis = require('@superpaper/redis-wrapper')
const rclient = redis.createClient(Settings.redis.lock)
const keys = Settings.redis.lock.key_schema
const RedisLocker = require('@superpaper/redis-wrapper/RedisLocker')

module.exports = new RedisLocker({
  rclient,
  getKey(docId) {
    return keys.blockingKey({ doc_id: docId })
  },
  wrapTimeoutError(err, docId) {
    err.doc_id = docId
    return err
  },
  metricsPrefix: 'doc',
  lockTTLSeconds: Settings.redisLockTTLSeconds,
})
