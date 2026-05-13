/* eslint-disable no-unused-vars */

import Helpers from './lib/helpers.mjs'

const tags = ['saas']

const indexes = [
  {
    key: { 'superpaper.backup.pendingChangeAt': 1 },
    name: 'superpaper_backup_pendingChangeAt_1',
    partialFilterExpression: {
      'superpaper.backup.pendingChangeAt': { $exists: true },
    },
  },
]

const migrate = async client => {
  const { db } = client
  await Helpers.addIndexesToCollection(db.projects, indexes)
}

const rollback = async client => {
  const { db } = client
  await Helpers.dropIndexesFromCollection(db.projects, indexes)
}

export default {
  tags,
  migrate,
  rollback,
}
