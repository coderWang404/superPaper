// Metrics must be initialized before importing anything else
import '@superpaper/metrics/initialize.js'

import Settings from '@superpaper/settings'
import logger from '@superpaper/logger'
import OError from '@superpaper/o-error'
import { mongoClient } from './app/js/mongodb.js'
import { app } from './app/js/server.js'

const host = Settings.internal.history.host
const port = Settings.internal.history.port

mongoClient
  .connect()
  .then(() => {
    app.listen(port, host, error => {
      if (error) {
        error = OError.tag(error, 'could not start history server')
        logger.error({ error }, error.message)
      } else {
        logger.debug({}, `history starting up, listening on ${host}:${port}`)
      }
    })
  })
  .catch(err => {
    logger.fatal({ err }, 'Cannot connect to mongo. Exiting.')
    process.exit(1)
  })
