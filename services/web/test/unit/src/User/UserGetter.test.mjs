import { vi, expect } from 'vitest'
import mongodb from 'mongodb-legacy'
import assert from 'node:assert'
import path from 'node:path'
import sinon from 'sinon'
import Errors from '../../../../app/src/Features/Errors/Errors.js'
import MongoHelpers from '../../../../app/src/Features/Helpers/Mongo.mjs'

const modulePath = path.join(
  import.meta.dirname,
  '../../../../app/src/Features/User/UserGetter'
)
const { normalizeQuery, normalizeMultiQuery } = MongoHelpers
const { ObjectId } = mongodb

vi.mock('../../../../app/src/Features/Errors/Errors.js', () =>
  vi.importActual('../../../../app/src/Features/Errors/Errors.js')
)

describe('UserGetter', function () {
  beforeEach(async function (ctx) {
    const confirmedAt = new Date()
    ctx.fakeUser = {
      _id: new ObjectId(),
      email: 'email2@foo.bar',
      emails: [
        {
          email: 'email1@foo.bar',
          reversedHostname: 'rab.oof',
          confirmedAt,
          lastConfirmedAt: confirmedAt,
        },
        { email: 'email2@foo.bar', reversedHostname: 'rab.oof' },
      ],
      features: {},
    }
    ctx.findOne = sinon.stub().resolves(ctx.fakeUser)
    ctx.findToArrayStub = sinon.stub().resolves([ctx.fakeUser])
    ctx.find = sinon.stub().returns({ toArray: ctx.findToArrayStub })
    ctx.Mongo = {
      db: {
        users: {
          findOne: ctx.findOne,
          find: ctx.find,
        },
      },
      ObjectId,
    }
    ctx.AsyncLocalStorage = {
      storage: {
        getStore: sinon.stub().returns(undefined),
      },
    }

    vi.doMock('../../../../app/src/Features/Helpers/Mongo', () => ({
      default: { normalizeQuery, normalizeMultiQuery },
    }))

    vi.doMock('../../../../app/src/infrastructure/mongodb', () => ctx.Mongo)

    vi.doMock('../../../../app/src/infrastructure/AsyncLocalStorage', () => ({
      default: ctx.AsyncLocalStorage,
    }))

    ctx.UserGetter = (await import(modulePath)).default
  })

  describe('getUser', function () {
    it('should get user', async function (ctx) {
      const query = { _id: '000000000000000000000000' }
      const projection = { email: 1 }
      const user = await ctx.UserGetter.promises.getUser(query, projection)
      ctx.findOne.calledWith(query, { projection }).should.equal(true)
      expect(user).to.deep.equal(ctx.fakeUser)
    })

    it('should not allow null query', async function (ctx) {
      await expect(
        ctx.UserGetter.promises.getUser(null, {})
      ).to.be.rejectedWith('no query provided')
    })
  })

  describe('getUsers', function () {
    it('should get users with array of userIds', async function (ctx) {
      const query = [new ObjectId()]
      const projection = { email: 1 }
      const users = await ctx.UserGetter.promises.getUsers(query, projection)
      ctx.find.should.have.been.calledWithMatch(
        { _id: { $in: query } },
        { projection }
      )
      users.should.deep.equal([ctx.fakeUser])
    })

    it('should not call mongo with empty list', async function (ctx) {
      const users = await ctx.UserGetter.promises.getUsers([], { email: 1 })
      expect(users).to.deep.equal([])
      expect(ctx.find).to.not.have.been.called
    })

    it('should not allow null query', async function (ctx) {
      await expect(
        ctx.UserGetter.promises.getUsers(null, {})
      ).to.be.rejectedWith('no query provided')
    })
  })

  describe('getUserFullEmails', function () {
    it('should get user with email projection', async function (ctx) {
      ctx.UserGetter.promises.getUser = sinon.stub().resolves(ctx.fakeUser)
      await ctx.UserGetter.promises.getUserFullEmails(ctx.fakeUser._id)
      ctx.UserGetter.promises.getUser.should.have.been.calledWith(
        ctx.fakeUser._id,
        { email: 1, emails: 1 }
      )
    })

    it('should fetch emails data', async function (ctx) {
      ctx.UserGetter.promises.getUser = sinon.stub().resolves(ctx.fakeUser)
      const fullEmails = await ctx.UserGetter.promises.getUserFullEmails(
        ctx.fakeUser._id
      )

      assert.deepEqual(fullEmails, [
        {
          email: 'email1@foo.bar',
          reversedHostname: 'rab.oof',
          confirmedAt: ctx.fakeUser.emails[0].confirmedAt,
          lastConfirmedAt: ctx.fakeUser.emails[0].lastConfirmedAt,
          default: false,
        },
        {
          email: 'email2@foo.bar',
          reversedHostname: 'rab.oof',
          default: true,
          lastConfirmedAt: null,
        },
      ])
    })

    it('should get user when it has no emails field', async function (ctx) {
      const fakeUserNoEmails = {
        _id: '12390i',
        email: 'email2@foo.bar',
      }
      ctx.UserGetter.promises.getUser = sinon.stub().resolves(fakeUserNoEmails)
      const fullEmails = await ctx.UserGetter.promises.getUserFullEmails(
        fakeUserNoEmails._id
      )
      ctx.UserGetter.promises.getUser.should.have.been.calledWith(
        fakeUserNoEmails._id,
        { email: 1, emails: 1 }
      )
      assert.deepEqual(fullEmails, [])
    })

    describe('caching full emails data if run inside AsyncLocalStorage context', function () {
      it('should store the data in the AsyncLocalStorage store', async function (ctx) {
        ctx.store = {}
        ctx.AsyncLocalStorage.storage.getStore.returns(ctx.store)
        ctx.UserGetter.promises.getUser = sinon.stub().resolves(ctx.fakeUser)
        const fullEmails = await ctx.UserGetter.promises.getUserFullEmails(
          ctx.fakeUser._id
        )
        expect(ctx.UserGetter.promises.getUser).to.have.been.calledOnce
        expect(ctx.store.userFullEmails[ctx.fakeUser._id]).to.deep.equal(
          fullEmails
        )
      })

      it('should fetch data from the store if available', async function (ctx) {
        ctx.store = {
          userFullEmails: {
            [ctx.fakeUser._id]: [{ email: '1' }, { email: '2' }],
          },
        }
        ctx.AsyncLocalStorage.storage.getStore.returns(ctx.store)
        ctx.UserGetter.promises.getUser = sinon.stub().resolves(ctx.fakeUser)
        const fullEmails = await ctx.UserGetter.promises.getUserFullEmails(
          ctx.fakeUser._id
        )
        expect(ctx.UserGetter.promises.getUser).to.not.have.been.called
        expect(fullEmails).to.deep.equal([{ email: '1' }, { email: '2' }])
      })

      it('should not return cached data for different user ids', async function (ctx) {
        ctx.store = {}
        ctx.AsyncLocalStorage.storage.getStore.returns(ctx.store)
        ctx.UserGetter.promises.getUser = sinon.stub().resolves(ctx.fakeUser)
        const fullEmails = await ctx.UserGetter.promises.getUserFullEmails(
          ctx.fakeUser._id
        )
        ctx.otherUser = {
          _id: new ObjectId(),
          email: 'other@foo.bar',
          emails: [
            {
              email: 'other@foo.bar',
              reversedHostname: 'rab.oof',
              confirmedAt: new Date(),
              lastConfirmedAt: new Date(),
            },
          ],
        }
        ctx.UserGetter.promises.getUser.resolves(ctx.otherUser)
        const fullEmailsOther = await ctx.UserGetter.promises.getUserFullEmails(
          ctx.otherUser._id
        )
        expect(ctx.UserGetter.promises.getUser).to.have.been.calledTwice
        expect(fullEmailsOther).to.not.deep.equal(fullEmails)
        expect(ctx.store.userFullEmails[ctx.fakeUser._id]).to.deep.equal(
          fullEmails
        )
        expect(ctx.store.userFullEmails[ctx.otherUser._id]).to.deep.equal(
          fullEmailsOther
        )
      })
    })
  })

  describe('getUserConfirmedEmails', function () {
    beforeEach(function (ctx) {
      ctx.fakeUser = {
        emails: [
          {
            email: 'email1@foo.bar',
            reversedHostname: 'rab.oof',
            confirmedAt: new Date(),
          },
          { email: 'email2@foo.bar', reversedHostname: 'rab.oof' },
          {
            email: 'email3@foo.bar',
            reversedHostname: 'rab.oof',
            confirmedAt: new Date(),
          },
        ],
      }
      ctx.UserGetter.promises.getUser = sinon.stub().resolves(ctx.fakeUser)
    })

    it('should get user', async function (ctx) {
      await ctx.UserGetter.promises.getUserConfirmedEmails(ctx.fakeUser._id)
      ctx.UserGetter.promises.getUser.should.have.been.calledWith(
        ctx.fakeUser._id,
        { emails: 1 }
      )
    })

    it('should return only confirmed emails', async function (ctx) {
      const confirmedEmails =
        await ctx.UserGetter.promises.getUserConfirmedEmails(ctx.fakeUser._id)
      expect(confirmedEmails.map(email => email.email)).to.deep.equal([
        'email1@foo.bar',
        'email3@foo.bar',
      ])
    })
  })

  describe('getUserbyMainEmail', function () {
    it('query user by main email', async function (ctx) {
      const email = 'hello@world.com'
      const projection = { emails: 1 }
      await ctx.UserGetter.promises.getUserByMainEmail(email, projection)
      ctx.findOne.calledWith({ email }, { projection }).should.equal(true)
    })

    it('return user if found', async function (ctx) {
      const user = await ctx.UserGetter.promises.getUserByMainEmail(
        'hello@world.com'
      )
      user.should.deep.equal(ctx.fakeUser)
    })

    it('trim email', async function (ctx) {
      const email = 'hello@world.com'
      await ctx.UserGetter.promises.getUserByMainEmail(` ${email} `)
      ctx.findOne.calledWith({ email }).should.equal(true)
    })
  })

  describe('getUserByAnyEmail', function () {
    it('query user for any email', async function (ctx) {
      const email = 'hello@world.com'
      const projection = { emails: 1 }
      const user = await ctx.UserGetter.promises.getUserByAnyEmail(
        ` ${email} `,
        projection
      )
      ctx.findOne
        .calledWith(
          {
            emails: { $exists: true },
            'emails.email': email,
          },
          { projection }
        )
        .should.equal(true)
      user.should.deep.equal(ctx.fakeUser)
    })

    it('query contains $exists:true so partial index is used', async function (ctx) {
      await ctx.UserGetter.promises.getUserByAnyEmail('', {})
      ctx.findOne
        .calledWith(
          {
            emails: { $exists: true },
            'emails.email': '',
          },
          { projection: {} }
        )
        .should.equal(true)
    })

    it('checks main email as well', async function (ctx) {
      ctx.findOne.resolves(null)
      const email = 'hello@world.com'
      const projection = { emails: 1 }
      await ctx.UserGetter.promises.getUserByAnyEmail(` ${email} `, projection)
      ctx.findOne.calledTwice.should.equal(true)
      ctx.findOne.calledWith({ email }, { projection }).should.equal(true)
    })
  })

  describe('getUsersByHostname', function () {
    it('should find user by hostname', async function (ctx) {
      const hostname = 'bar.foo'
      const expectedQuery = {
        emails: { $exists: true },
        'emails.reversedHostname': hostname.split('').reverse().join(''),
      }
      const projection = { emails: 1 }
      await ctx.UserGetter.promises.getUsersByHostname(hostname, projection)
      ctx.find.calledWith(expectedQuery, { projection }).should.equal(true)
    })
  })

  describe('getUsersByAnyConfirmedEmail', function () {
    it('should find users by confirmed email', async function (ctx) {
      const emails = ['confirmed@example.com']
      await ctx.UserGetter.promises.getUsersByAnyConfirmedEmail(emails)
      expect(ctx.find).to.be.calledOnceWith(
        {
          'emails.email': { $in: emails },
          emails: {
            $exists: true,
            $elemMatch: {
              email: { $in: emails },
              confirmedAt: { $exists: true },
            },
          },
        },
        { projection: {} }
      )
    })
  })

  describe('getUsersByV1Id', function () {
    it('should find users by list of v1 ids', async function (ctx) {
      const v1Ids = [501]
      const projection = { emails: 1 }
      await ctx.UserGetter.promises.getUsersByV1Ids(v1Ids, projection)
      ctx.find
        .calledWith({ 'superpaper.id': { $in: v1Ids } }, { projection })
        .should.equal(true)
    })
  })

  describe('ensureUniqueEmailAddress', function () {
    beforeEach(function (ctx) {
      ctx.UserGetter.promises.getUserByAnyEmail = sinon.stub()
    })

    it('should return error if existing user is found', async function (ctx) {
      ctx.UserGetter.promises.getUserByAnyEmail.resolves(ctx.fakeUser)
      await expect(
        ctx.UserGetter.promises.ensureUniqueEmailAddress(ctx.newEmail)
      ).to.be.rejectedWith(Errors.EmailExistsError)
    })

    it('should return null if no user is found', async function (ctx) {
      ctx.UserGetter.promises.getUserByAnyEmail.resolves(null)
      await expect(
        ctx.UserGetter.promises.ensureUniqueEmailAddress(ctx.newEmail)
      ).to.be.fulfilled
    })
  })

  describe('getUserFeatures', function () {
    it('should return user features', async function (ctx) {
      ctx.fakeUser.features = { feature1: true, feature2: false }
      const features = await ctx.UserGetter.promises.getUserFeatures(
        ctx.fakeUser._id
      )
      expect(features).to.deep.equal(ctx.fakeUser.features)
    })

    it('should return an empty object when the user has no feature data', async function (ctx) {
      ctx.fakeUser.features = undefined
      const features = await ctx.UserGetter.promises.getUserFeatures(
        ctx.fakeUser._id
      )
      expect(features).to.deep.equal({})
    })
  })
})
