import Queue from 'bull'
import Settings from '@superpaper/settings'
import { addConnectionDrainer } from './GracefulShutdown.mjs'

// Bull will keep a fixed number of the most recently completed jobs. This is
// useful to inspect recently completed jobs. The bull prometheus exporter also
// uses the completed job records to report on job duration.
const MAX_COMPLETED_JOBS_RETAINED = 10000
const MAX_FAILED_JOBS_RETAINED = 50000

const QUEUES_JOB_OPTIONS = {
  'scheduled-jobs': {
    removeOnFail: MAX_FAILED_JOBS_RETAINED,
    attempts: 1,
  },
  'project-notification': {
    removeOnFail: MAX_FAILED_JOBS_RETAINED,
    attempts: 3,
  },
}

const queues = {}

function getQueue(queueName) {
  if (!queues[queueName]) {
    const redisOptions = Settings.redis.queues
    const jobOptions = QUEUES_JOB_OPTIONS[queueName] || {}
    queues[queueName] = new Queue(queueName, {
      // this configuration is duplicated in /services/analytics/app/js/Queues.js
      // and needs to be manually kept in sync whenever modified
      redis: redisOptions,
      defaultJobOptions: {
        removeOnComplete: MAX_COMPLETED_JOBS_RETAINED,
        attempts: 11,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        ...jobOptions,
      },
    })

    // Disconnect from redis eventually.
    addConnectionDrainer(`bull queue ${queueName}`, async () => {
      await queues[queueName].disconnect()
    })
  }
  return queues[queueName]
}

async function createScheduledJob(queueName, { name, data, options }, delay) {
  await getQueue('scheduled-jobs').add(
    { queueName, name, data, options },
    {
      delay,
    }
  )
}

export default {
  getQueue,
  createScheduledJob,
}
