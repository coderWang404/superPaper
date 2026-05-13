import { expect, vi } from 'vitest'
import sinon from 'sinon'
import mongodb from 'mongodb-legacy'

const ObjectId = mongodb.ObjectId

vi.mock('../../../../../app/src/Features/Errors/Errors.js', () => {
  return vi.importActual('../../../../../app/src/Features/Errors/Errors.js')
})

const modulePath =
  '../../../../app/src/infrastructure/rate-limiters/AiFeatureUsageRateLimiter.mjs'

describe('AiFeatureUsageRateLimiter', function () {
  beforeEach(async function (ctx) {
    ctx.userId = new ObjectId().toString()

    ctx.UserFeatureUsageModel = {
      findOneAndUpdate: sinon.stub().returns({
        exec: sinon.stub().resolves({
          features: {
            aiFeatureUsage: {
              usage: 0,
              periodStart: new Date(),
            },
          },
        }),
      }),
      findOne: sinon.stub().returns({
        exec: sinon.stub().resolves({
          features: {
            aiFeatureUsage: {
              usage: 0,
              periodStart: new Date(),
            },
          },
        }),
      }),
    }

    vi.doMock('../../../../app/src/models/UserFeatureUsage', () => ({
      UserFeatureUsage: ctx.UserFeatureUsageModel,
    }))

    const module = await import(modulePath)
    ctx.AiFeatureUsageRateLimiter = module.default
  })

  describe('useFeature', function () {
    it('allows zero-cost checks while AI usage is disabled', async function (ctx) {
      const res = { set: sinon.stub(), headersSent: false }
      await expect(
        ctx.AiFeatureUsageRateLimiter.useFeature(ctx.userId, res, 0)
      ).to.not.be.rejected
    })

    it('rejects positive usage while AI usage is disabled', async function (ctx) {
      const res = { set: sinon.stub(), headersSent: false }
      ctx.UserFeatureUsageModel.findOneAndUpdate = sinon.stub().returns({
        exec: sinon.stub().resolves({
          features: {
            aiFeatureUsage: {
              usage: 1,
              periodStart: new Date(),
            },
          },
        }),
      })

      await expect(
        ctx.AiFeatureUsageRateLimiter.useFeature(ctx.userId, res, 1)
      ).to.be.rejectedWith('aiFeatureUsage rate limit exceeded')
    })
  })

  describe('getRemainingFeatureUses', function () {
    it('returns zero remaining uses while AI usage is disabled', async function (ctx) {
      const usages =
        await ctx.AiFeatureUsageRateLimiter.getRemainingFeatureUses(ctx.userId)
      expect(usages.aiFeatureUsage.remainingUsage).to.equal(0)
    })
  })

  describe('decrementFeatureUsage', function () {
    it('can decrement stored usage', async function (ctx) {
      const res = { set: sinon.stub(), headersSent: false }
      await ctx.AiFeatureUsageRateLimiter.decrementFeatureUsage(
        ctx.userId,
        res,
        1
      )
      expect(ctx.UserFeatureUsageModel.findOneAndUpdate).to.have.been.called
    })
  })
})
