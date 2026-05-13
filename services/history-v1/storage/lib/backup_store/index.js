const { Binary, ObjectId } = require('mongodb')
const { projects, deletedProjects, backedUpBlobs } = require('../mongodb')
const OError = require('@superpaper/o-error')

// List projects with pending backups older than the specified interval
function listPendingBackups(timeIntervalMs = 0, limit = null) {
  const cutoffTime = new Date(Date.now() - timeIntervalMs)
  const options = {
    projection: { 'superpaper.backup.pendingChangeAt': 1 },
    sort: { 'superpaper.backup.pendingChangeAt': 1 },
  }

  // Apply limit if provided
  if (limit) {
    options.limit = limit
  }

  const cursor = projects.find(
    {
      'superpaper.backup.pendingChangeAt': {
        $exists: true,
        $lt: cutoffTime,
      },
    },
    options
  )
  return cursor
}

// List projects that have never been backed up and are older than the specified interval
function listUninitializedBackups(timeIntervalMs = 0, limit = null) {
  const cutoffTimeInSeconds = (Date.now() - timeIntervalMs) / 1000
  const options = {
    projection: { _id: 1 },
    sort: { _id: 1 },
  }
  // Apply limit if provided
  if (limit) {
    options.limit = limit
  }
  const cursor = projects.find(
    {
      'superpaper.backup.lastBackedUpVersion': null,
      _id: {
        $lt: ObjectId.createFromTime(cutoffTimeInSeconds),
      },
    },
    options
  )
  return cursor
}

// Retrieve the history ID for a given project without giving direct access to the
// projects collection.

async function getHistoryId(projectId) {
  const project = await projects.findOne(
    { _id: new ObjectId(projectId) },
    {
      projection: {
        'superpaper.history.id': 1,
      },
    }
  )
  if (!project) {
    throw new Error('Project not found')
  }
  return project.superpaper.history.id
}

async function getBackupStatus(projectId, options = {}) {
  const projection = {
    'superpaper.history': 1,
    'superpaper.backup': 1,
  }
  if (options.includeRootFolder) {
    projection.rootFolder = 1
  }
  const project = await projects.findOne(
    { _id: new ObjectId(projectId) },
    {
      projection,
    }
  )
  if (!project) {
    // Check whether the project was deleted
    const deletedProject = await deletedProjects.findOne({
      'deleterData.deletedProjectId': new ObjectId(projectId),
    })
    if (deletedProject) {
      throw new Error('Project deleted')
    }
    throw new Error('Project not found')
  }
  return {
    backupStatus: project.superpaper.backup,
    historyId: `${project.superpaper.history.id}`,
    currentEndVersion: project.superpaper.history.currentEndVersion,
    currentEndTimestamp: project.superpaper.history.currentEndTimestamp,
    ...(options.includeRootFolder && { rootFolder: project.rootFolder?.[0] }),
  }
}

/**
 * Recursively traverses the file tree and collects file hashes into a Set.
 *
 * @param {object} rootFolder - The root folder object of the file tree.
 * @returns {Set<string>} A Set containing all unique file hashes found in the file tree.
 */
function getHashesFromFileTree(rootFolder) {
  const hashSet = new Set()

  function processFolder(folder) {
    for (const file of folder.fileRefs || []) {
      if (file?.hash) {
        hashSet.add(file.hash)
      }
    }

    for (const subfolder of folder.folders || []) {
      if (subfolder?._id) {
        processFolder(subfolder)
      }
    }
  }

  processFolder(rootFolder)

  return hashSet
}

async function setBackupVersion(
  projectId,
  previousBackedUpVersion,
  currentBackedUpVersion,
  currentBackedUpAt
) {
  // FIXME: include a check to handle race conditions
  // to make sure only one process updates the version numbers
  const result = await projects.updateOne(
    {
      _id: new ObjectId(projectId),
      'superpaper.backup.lastBackedUpVersion': previousBackedUpVersion,
    },
    {
      $set: {
        'superpaper.backup.lastBackedUpVersion': currentBackedUpVersion,
        'superpaper.backup.lastBackedUpAt': currentBackedUpAt,
      },
    }
  )
  if (result.matchedCount === 0 || result.modifiedCount === 0) {
    throw new OError('Failed to update backup version', {
      previousBackedUpVersion,
      currentBackedUpVersion,
      currentBackedUpAt,
      result,
    })
  }
}

async function updateCurrentMetadataIfNotSet(projectId, latestChunkMetadata) {
  await projects.updateOne(
    {
      _id: new ObjectId(projectId),
      'superpaper.history.currentEndVersion': { $exists: false },
      'superpaper.history.currentEndTimestamp': { $exists: false },
    },
    {
      $set: {
        'superpaper.history.currentEndVersion': latestChunkMetadata.endVersion,
        'superpaper.history.currentEndTimestamp':
          latestChunkMetadata.endTimestamp,
      },
    }
  )
}

/**
 * Updates the pending change timestamp for a project's backup status
 * @param {string} projectId - The ID of the project to update
 * @param {Date} backupStartTime - The timestamp to set for pending changes
 * @returns {Promise<void>}
 *
 * If the project's last backed up version matches the current end version,
 * the pending change timestamp is removed. Otherwise, it's set to the provided
 * backup start time.
 */
async function updatePendingChangeTimestamp(projectId, backupStartTime) {
  await projects.updateOne({ _id: new ObjectId(projectId) }, [
    {
      $set: {
        'superpaper.backup.pendingChangeAt': {
          $cond: {
            if: {
              $eq: [
                '$superpaper.backup.lastBackedUpVersion',
                '$superpaper.history.currentEndVersion',
              ],
            },
            then: '$$REMOVE',
            else: backupStartTime,
          },
        },
      },
    },
  ])
}

async function getBackedUpBlobHashes(projectId) {
  const result = await backedUpBlobs.findOne(
    { _id: new ObjectId(projectId) },
    { projection: { blobs: 1 } }
  )
  if (!result) {
    return new Set()
  }
  const hashes = result.blobs.map(b => b.buffer.toString('hex'))
  return new Set(hashes)
}

async function unsetBackedUpBlobHashes(projectId, hashes) {
  const binaryHashes = hashes.map(h => new Binary(Buffer.from(h, 'hex')))
  const result = await backedUpBlobs.findOneAndUpdate(
    { _id: new ObjectId(projectId) },
    {
      $pullAll: {
        blobs: binaryHashes,
      },
    },
    { returnDocument: 'after' }
  )
  if (result && result.blobs.length === 0) {
    await backedUpBlobs.deleteOne({
      _id: new ObjectId(projectId),
      blobs: { $size: 0 },
    })
  }
  return result
}

module.exports = {
  getHistoryId,
  getBackupStatus,
  setBackupVersion,
  updateCurrentMetadataIfNotSet,
  updatePendingChangeTimestamp,
  listPendingBackups,
  listUninitializedBackups,
  getBackedUpBlobHashes,
  unsetBackedUpBlobHashes,
  getHashesFromFileTree,
}
