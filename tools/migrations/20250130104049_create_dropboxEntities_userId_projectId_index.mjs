import Helpers from './lib/helpers.mjs'

const tags = ['server-ce', 'server-pro', 'saas']

const indexes = [
  {
    key: { 'superpaper.userId': 1, 'superpaper.projectId': 1 },
    name: 'superpaper_userId_1_superpaper_projectId_1',
  },
]

const migrate = async client => {
  const { db } = client
  await Helpers.addIndexesToCollection(db.dropboxEntities, indexes)
}

const rollback = async client => {
  const { db } = client
  await Helpers.dropIndexesFromCollection(db.dropboxEntities, indexes)
}

export default {
  tags,
  migrate,
  rollback,
}
