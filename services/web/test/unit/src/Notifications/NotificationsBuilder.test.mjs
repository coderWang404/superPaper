import { vi, expect } from 'vitest'
import sinon from 'sinon'
import path from 'node:path'
const modulePath = path.join(
  import.meta.dirname,
  '../../../../app/src/Features/Notifications/NotificationsBuilder.mjs'
)

describe('NotificationsBuilder', function () {
  const userId = '507f1f77bcf86cd799439011'

  beforeEach(async function (ctx) {
    ctx.handler = { promises: { createNotification: sinon.stub().resolves() } }

    vi.doMock(
      '../../../../app/src/Features/Notifications/NotificationsHandler',
      () => ({
        default: ctx.handler,
      })
    )

    ctx.controller = (await import(modulePath)).default
  })

  describe('dropboxUnlinkedDueToLapsedReconfirmation', function () {
    it('should create the notification', async function (ctx) {
      await ctx.controller.promises
        .dropboxUnlinkedDueToLapsedReconfirmation(userId)
        .create()
      expect(ctx.handler.promises.createNotification).to.have.been.calledWith(
        userId,
        'drobox-unlinked-due-to-lapsed-reconfirmation',
        'notification_dropbox_unlinked_due_to_lapsed_reconfirmation',
        {},
        null,
        true
      )
    })
    describe('NotificationsHandler error', function () {
      let anError
      beforeEach(function (ctx) {
        anError = new Error('oops')
        ctx.handler.promises.createNotification.rejects(anError)
      })
      it('should return errors from NotificationsHandler', async function (ctx) {
        let error

        try {
          await ctx.controller.promises
            .dropboxUnlinkedDueToLapsedReconfirmation(userId)
            .create()
        } catch (err) {
          error = err
        }

        expect(error).to.equal(anError)
      })
    })
  })

})
