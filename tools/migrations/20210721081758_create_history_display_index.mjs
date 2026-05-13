import Helpers from './lib/helpers.mjs'

const tags = ['saas']

const indexes = [
  {
    key: {
      'superpaper.history.display': 1,
    },
    name: 'superpaper.history.display_1',
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
