// @ts-check
import TokenUsageRateLimiter from './TokenUsageRateLimiter.mjs'

class WorkbenchRateLimiter extends TokenUsageRateLimiter {
  constructor() {
    super('aiWorkbench')
  }

  /**
   * @param {string} _userId
   * @returns {Promise<number>}
   */
  async _getAllowance(_userId) {
    return 0
  }
}
export default new WorkbenchRateLimiter()
