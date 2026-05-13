import Settings from '@superpaper/settings'
import logger from '@superpaper/logger'
import { db } from '../../../app/src/infrastructure/mongodb.mjs'
import { fileURLToPath } from 'url'
const DRY_RUN = !process.argv.includes('--dry-run=false')

function mergeFeatures(currentFeatures = {}, defaultFeatures = {}) {
  const merged = { ...currentFeatures }
  for (const [key, defaultValue] of Object.entries(defaultFeatures)) {
    const currentValue = currentFeatures[key]
    if (currentValue === undefined) {
      merged[key] = defaultValue
      continue
    }

    if (typeof defaultValue === 'number' && typeof currentValue === 'number') {
      if (key === 'compileTimeout') {
        merged[key] = Math.max(currentValue, defaultValue)
      } else {
        merged[key] = currentValue
      }
      continue
    }

    if (typeof defaultValue === 'boolean') {
      merged[key] = currentValue || defaultValue
      continue
    }

    merged[key] = currentValue
  }
  return merged
}

function compareFeatures(nextFeatures, previousFeatures) {
  const diff = {}
  const keys = new Set([
    ...Object.keys(nextFeatures || {}),
    ...Object.keys(previousFeatures || {}),
  ])
  for (const key of keys) {
    if (nextFeatures?.[key] !== previousFeatures?.[key]) {
      diff[key] = {
        from: previousFeatures?.[key],
        to: nextFeatures?.[key],
      }
    }
  }
  return diff
}

async function main(DRY_RUN, defaultFeatures) {
  logger.info({ defaultFeatures }, 'default features')

  const cursor = db.users.find(
    {},
    { projection: { _id: 1, email: 1, features: 1 } }
  )
  for await (const user of cursor) {
    const newFeatures = mergeFeatures(user.features, defaultFeatures)
    const diff = compareFeatures(newFeatures, user.features)
    if (Object.keys(diff).length > 0) {
      logger.warn(
        {
          userId: user._id,
          email: user.email,
          oldFeatures: user.features,
          newFeatures,
        },
        'user features upgraded'
      )

      if (!DRY_RUN) {
        await db.users.updateOne(
          { _id: user._id },
          { $set: { features: newFeatures } }
        )
      }
    }
  }
}

export default main

const filename = fileURLToPath(import.meta.url)

if (filename === process.argv[1]) {
  if (DRY_RUN) {
    console.error('---')
    console.error('Dry-run enabled, use --dry-run=false to commit changes')
    console.error('---')
  }
  main(DRY_RUN, Settings.defaultFeatures)
    .then(() => {
      console.log('Done.')
      process.exit(0)
    })
    .catch(error => {
      console.error({ error })
      process.exit(1)
    })
}
