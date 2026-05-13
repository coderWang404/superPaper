/** @type {(...args: unknown[]) => void} */
const noop = (..._args) => {}

/** @type {(...args: unknown[]) => Promise<void>} */
const asyncNoop = async (..._args) => {}

function getIdsFromSession(session = {}) {
  const userId = session.user?._id || session.passport?.user?._id || null
  return {
    userId,
    analyticsId: session.analyticsId || userId,
  }
}

export default {
  getIdsFromSession,
  identifyUser: noop,
  recordEventForSession: noop,
  recordEventForUserInBackground: noop,
  emitPackageUsage: noop,
  setUserPropertyForUser: asyncNoop,
  setUserPropertyForUserInBackground: noop,
}
