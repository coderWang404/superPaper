import mongoose from 'mongoose'
import Settings from '@superpaper/settings'
import Metrics from '@superpaper/metrics'
import logger from '@superpaper/logger'
import { addConnectionDrainer } from './GracefulShutdown.mjs'

mongoose.set('autoIndex', false)
mongoose.set('strictQuery', false)

const connectionPromise = mongoose.connect(
  Settings.mongo.url,
  Settings.mongo.options
)
Metrics.mongodb.monitor(mongoose.connection.client, 'mongoose')

addConnectionDrainer('mongoose', async () => {
  await connectionPromise
  await mongoose.disconnect()
})

mongoose.connection.on('connected', () =>
  logger.debug('mongoose default connection open')
)

mongoose.connection.on('error', err =>
  logger.err({ err }, 'mongoose error on default connection')
)

mongoose.connection.on('disconnected', () =>
  logger.debug('mongoose default connection disconnected')
)

if (process.env.MONGOOSE_DEBUG) {
  mongoose.set('debug', (collectionName, method, query, doc) =>
    logger.debug({ collectionName, method, query, doc }, 'mongoose debug')
  )
}

mongoose.plugin(schema => {
  schema.options.usePushEach = true
})

mongoose.Promise = global.Promise

mongoose.connectionPromise = connectionPromise

export default mongoose
