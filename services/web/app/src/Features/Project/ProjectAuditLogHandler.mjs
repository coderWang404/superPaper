import logger from '@superpaper/logger'
import { ProjectAuditLogEntry } from '../../models/ProjectAuditLogEntry.mjs'
import { callbackify } from '@superpaper/promise-utils'

export default {
  promises: {
    addEntry,
  },
  addEntry: callbackify(addEntry),
  addEntryInBackground,
}

/**
 * The entry should include at least the following fields:
 *
 * @param {ObjectId} projectId - the project for which the operation was performed
 * @param {string} operation - a string identifying the type of operation
 * @param {ObjectId} initiatorId - the user on behalf of whom the operation was performed
 * @param {string} ipAddress - the IP address of the initiator
 * @param {object} info - any additional payload
 */
async function addEntry(
  projectId,
  operation,
  initiatorId,
  ipAddress,
  info = {}
) {
  const entry = {
    projectId,
    operation,
    initiatorId,
    ipAddress,
    info,
  }
  await ProjectAuditLogEntry.create(entry)
}

/**
 * Add an audit log entry in the background
 *
 * This function doesn't return a promise. Instead, it catches any error and logs it.
 */
function addEntryInBackground(
  projectId,
  operation,
  initiatorId,
  ipAddress,
  info = {}
) {
  addEntry(projectId, operation, initiatorId, ipAddress, info).catch(err => {
    logger.error(
      { err, projectId, operation, initiatorId, ipAddress, info },
      'Failed to write audit log'
    )
  })
}
