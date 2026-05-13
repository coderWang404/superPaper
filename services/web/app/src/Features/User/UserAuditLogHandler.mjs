import OError from '@superpaper/o-error'
import logger from '@superpaper/logger'
import { UserAuditLogEntry } from '../../models/UserAuditLogEntry.mjs'
import { callbackify } from 'node:util'

function _canHaveNoIpAddressId(operation, info) {
  if (operation === 'add-email' && info.script) return true
  if (operation === 'must-reset-password-set') return true
  if (operation === 'remove-email' && info.script) return true
  if (operation === 'unlink-dropbox' && info.batch) return true
  return false
}

function _canHaveNoInitiatorId(operation, info) {
  if (operation === 'add-email' && info.script) return true
  if (operation === 'reset-password') return true
  if (operation === 'remove-email' && info.script) return true
  if (operation === 'must-reset-password-set') return true
  if (operation === 'must-reset-password-unset') return true
  if (operation === 'account-suspension' && info.script) return true
}

/**
 * Add an audit log entry
 *
 * The entry should include at least the following fields:
 *
 * - userId: the user on behalf of whom the operation was performed
 * - operation: a string identifying the type of operation
 * - initiatorId: who performed the operation
 * - ipAddress: the IP address of the initiator
 * - info: an object detailing what happened
 */
async function addEntry(userId, operation, initiatorId, ipAddress, info = {}) {
  if (!operation) {
    throw new OError('missing operation for audit log', {
      initiatorId,
      ipAddress,
    })
  }

  if (!ipAddress && !_canHaveNoIpAddressId(operation, info)) {
    throw new OError('missing ipAddress for audit log', {
      operation,
      initiatorId,
    })
  }

  if (!initiatorId && !_canHaveNoInitiatorId(operation, info)) {
    throw new OError('missing initiatorId for audit log', {
      operation,
      ipAddress,
    })
  }

  const entry = {
    userId,
    operation,
    initiatorId,
    info,
    ipAddress,
  }

  await UserAuditLogEntry.create(entry)
}

function addEntryInBackground(
  userId,
  operation,
  initiatorId,
  ipAddress,
  info = {}
) {
  // Intentionally not awaited
  addEntry(userId, operation, initiatorId, ipAddress, info).catch(err => {
    logger.error(
      { err, userId, operation, initiatorId, ipAddress, info },
      'error adding user audit log entry'
    )
  })
}

const UserAuditLogHandler = {
  addEntry: callbackify(addEntry),
  promises: {
    addEntry,
  },
  addEntryInBackground,
}

export default UserAuditLogHandler
