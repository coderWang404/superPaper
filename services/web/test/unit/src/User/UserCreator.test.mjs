import { vi, assert } from 'vitest'
import sinon from 'sinon'

const modulePath = '../../../../app/src/Features/User/UserCreator.mjs'

describe('UserCreator', function () {
  beforeEach(async function (ctx) {
    const self = ctx
    ctx.user = { _id: '12390i', ace: {} }
    ctx.user.save = sinon.stub().resolves(self.user)
    ctx.UserModel = class Project {
      constructor() {
        return self.user
      }
    }

    ctx.logger = {
      error: sinon.stub(),
      warn: sinon.stub(),
    }
    vi.doMock('@superpaper/logger', () => ({
      default: ctx.logger,
    }))

    vi.doMock('../../../../app/src/models/User', () => ({
      User: ctx.UserModel,
    }))

    vi.doMock(
      '../../../../app/src/Features/Telemetry/TelemetryManager',
      () => ({
        default: (ctx.Analytics = {
          recordEventForUserInBackground: sinon.stub(),
          setUserPropertyForUser: sinon.stub(),
        }),
      })
    )

    ctx.UserCreator = (await import(modulePath)).default

    ctx.email = 'bob.oswald@gmail.com'
  })

  describe('createNewUser', function () {
    describe('with callbacks', function () {
      it('should take the opts and put them in the model', async function (ctx) {
        const user = await ctx.UserCreator.promises.createNewUser({
          email: ctx.email,
          holdingAccount: true,
        })
        assert.equal(user.email, ctx.email)
        assert.equal(user.holdingAccount, true)
        assert.equal(user.first_name, 'bob.oswald')
      })

      it('should use the start of the email if the first name is empty string', async function (ctx) {
        const user = await ctx.UserCreator.promises.createNewUser({
          email: ctx.email,
          holdingAccount: true,
          first_name: '',
        })
        assert.equal(user.email, ctx.email)
        assert.equal(user.holdingAccount, true)
        assert.equal(user.first_name, 'bob.oswald')
      })

      it('should use the first name if passed', async function (ctx) {
        const user = await ctx.UserCreator.promises.createNewUser({
          email: ctx.email,
          holdingAccount: true,
          first_name: 'fiiirstname',
        })
        assert.equal(user.email, ctx.email)
        assert.equal(user.holdingAccount, true)
        assert.equal(user.first_name, 'fiiirstname')
      })

      it('should use the last name if passed', async function (ctx) {
        const user = await ctx.UserCreator.promises.createNewUser({
          email: ctx.email,
          holdingAccount: true,
          last_name: 'lastNammmmeee',
        })
        assert.equal(user.email, ctx.email)
        assert.equal(user.holdingAccount, true)
        assert.equal(user.last_name, 'lastNammmmeee')
      })

      it('should set emails attribute', async function (ctx) {
        const user = await ctx.UserCreator.promises.createNewUser({
          email: ctx.email,
        })
        user.email.should.equal(ctx.email)
        user.emails.length.should.equal(1)
        user.emails[0].email.should.equal(ctx.email)
        user.emails[0].createdAt.should.be.a('date')
        user.emails[0].reversedHostname.should.equal('moc.liamg')
      })

    })

    describe('with promises', function () {
      it('should take the opts and put them in the model', async function (ctx) {
        const opts = {
          email: ctx.email,
          holdingAccount: true,
        }
        const user = await ctx.UserCreator.promises.createNewUser(opts)
        assert.equal(user.email, ctx.email)
        assert.equal(user.holdingAccount, true)
        assert.equal(user.first_name, 'bob.oswald')
      })

      it('should fire an analytics event and user property on registration', async function (ctx) {
        const user = await ctx.UserCreator.promises.createNewUser({
          email: ctx.email,
        })
        assert.equal(user.email, ctx.email)
        sinon.assert.calledWith(
          ctx.Analytics.recordEventForUserInBackground,
          user._id,
          'user-registered'
        )
        sinon.assert.calledWith(
          ctx.Analytics.setUserPropertyForUser,
          user._id,
          'created-at'
        )
      })
    })
  })
})
