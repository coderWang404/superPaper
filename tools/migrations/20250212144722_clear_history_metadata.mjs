/* eslint-disable no-unused-vars */

import { batchedUpdate } from '@superpaper/mongo-utils/batchedUpdate.js'

const tags = ['saas']

const migrate = async client => {
  const { db } = client

  await batchedUpdate(
    db.projects,
    { 'superpaper.history.currentEndVersion': { $exists: true } },
    {
      $unset: {
        'superpaper.history.currentEndVersion': true,
        'superpaper.history.currentEndTimestamp': true,
        'superpaper.history.updatedAt': true,
        'superpaper.backup.pendingChangeAt': true,
      },
    }
  )
}

const rollback = async client => {}

export default {
  tags,
  migrate,
  rollback,
}
