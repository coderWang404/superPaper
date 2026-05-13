/**
 * @param {...unknown} _args
 */
async function sessionMaintenance(..._args) {}

/**
 * @param {...unknown} _args
 */
function collectSessionStats(..._args) {}

export default {
  collectSessionStats,
  sessionMaintenance,
  promises: {
    sessionMaintenance,
  },
}
