// @ts-check

import FeatureUsageRateLimiter from './FeatureUsageRateLimiter.mjs'

class AiFeatureUsageRateLimiter extends FeatureUsageRateLimiter {
  constructor() {
    super('aiFeatureUsage')
  }

  /**
   * @param {string} _userId
   * @returns {Promise<number>}
   */
  async _getAllowance(_userId) {
    return 0
  }
}

export default new AiFeatureUsageRateLimiter()
