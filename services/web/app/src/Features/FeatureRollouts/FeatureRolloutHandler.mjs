import crypto from 'node:crypto'
import LocalsHelper from './LocalsHelper.mjs'

const DEFAULT_ASSIGNMENT = {
  variant: 'default',
  metadata: {},
}

const ENABLED_BY_DEFAULT = new Set(['sharing-updates'])

function assignmentFor(name) {
  return {
    ...DEFAULT_ASSIGNMENT,
    variant: ENABLED_BY_DEFAULT.has(name) ? 'enabled' : 'default',
  }
}

async function getAssignment(req, res, name) {
  const assignment = assignmentFor(name)
  if (res?.locals) {
    LocalsHelper.setSplitTestVariant(res.locals, name, assignment.variant)
  }
  return assignment
}

async function getAssignmentForUser(_userId, name) {
  return assignmentFor(name)
}

function getPercentile(id, rolloutName, phase = 'release') {
  const hash = crypto
    .createHash('md5')
    .update(`${rolloutName}:${phase}:${id || ''}`)
    .digest('hex')
  return parseInt(hash.slice(26, 32), 16) % 100
}

async function hasUserBeenAssignedToVariant() {
  return false
}

/**
 * @param {...unknown} _args
 */
async function featureFlagEnabledForUser(..._args) {
  return false
}

export default {
  featureFlagEnabledForUser,
  getAssignment,
  getAssignmentForUser,
  getPercentile,
  hasUserBeenAssignedToVariant,
  promises: {
    featureFlagEnabledForUser,
    getAssignment,
    getAssignmentForUser,
    hasUserBeenAssignedToVariant,
  },
}
