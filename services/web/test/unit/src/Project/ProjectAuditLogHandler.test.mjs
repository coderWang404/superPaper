import { vi, expect } from 'vitest'
import mongodb from 'mongodb-legacy'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/Project/ProjectAuditLogHandler.mjs'

const { ObjectId } = mongodb

const projectId = new ObjectId()
const userId = new ObjectId()

describe('ProjectAuditLogHandler', function () {
  beforeEach(async function (ctx) {
    ctx.createEntryMock = sinon.stub().resolves()
    vi.doMock('../../../../app/src/models/ProjectAuditLogEntry', () => ({
      ProjectAuditLogEntry: {
        create: ctx.createEntryMock,
      },
    }))

    ctx.ProjectAuditLogHandler = (await import(modulePath)).default
  })

  describe('addEntry', function () {
    it('creates an entry in the database', async function (ctx) {
      await ctx.ProjectAuditLogHandler.promises.addEntry(
        projectId,
        'project-op',
        userId,
        '0:0:0:0'
      )
      expect(ctx.createEntryMock).to.have.been.calledOnceWith({
        operation: 'project-op',
        projectId,
        initiatorId: userId,
        ipAddress: '0:0:0:0',
        info: {},
      })
    })
  })
})
