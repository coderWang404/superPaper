import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentPatchManager.mjs'

describe('AiAgentPatchManager', function () {
  beforeEach(async function (ctx) {
    ctx.docs = {
      '/main.tex': {
        _id: 'doc-main',
        lines: [
          '\\documentclass{article}',
          '\\begin{document}',
          'Old sentence.',
          '\\end{document}',
        ],
        rev: 7,
      },
    }
    ctx.ProjectEntityHandler = {
      promises: {
        getAllDocs: sinon.stub().resolves(ctx.docs),
      },
    }
    ctx.DocumentUpdaterHandler = {
      promises: {
        setDocument: sinon.stub().resolves({ rev: 8, modified: true }),
      },
    }
    ctx.AgentEvent = {
      countDocuments: sinon.stub().returns({
        exec: sinon.stub().resolves(0),
      }),
      create: sinon.stub().resolves({}),
    }
    ctx.AgentSession = {
      updateOne: sinon.stub().returns({
        exec: sinon.stub().resolves({ modifiedCount: 1 }),
      }),
    }
    ctx.patchDocument = {
      _id: 'patch-one',
      sessionId: 'session-one',
      projectId: 'project-one',
      createdByUserId: 'user-one',
      status: 'pending',
      summary: 'Update wording',
      riskLevel: 'low',
      save: sinon.stub().resolvesThis(),
    }
    ctx.AgentPatch = {
      create: sinon.stub().callsFake(async patch => {
        Object.assign(ctx.patchDocument, patch)
        return ctx.patchDocument
      }),
      findOne: sinon.stub().returns({
        exec: sinon.stub().resolves(ctx.patchDocument),
      }),
    }

    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler',
      () => ({
        default: ctx.ProjectEntityHandler,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler',
      () => ({
        default: ctx.DocumentUpdaterHandler,
      })
    )
    vi.doMock('../../../../app/src/models/AgentPatch', () => ({
      AgentPatch: ctx.AgentPatch,
    }))
    vi.doMock('../../../../app/src/models/AgentEvent', () => ({
      AgentEvent: ctx.AgentEvent,
    }))
    vi.doMock('../../../../app/src/models/AgentSession', () => ({
      AgentSession: ctx.AgentSession,
    }))

    ctx.PatchManager = await import(modulePath)
  })

  it('creates a pending replace_text patch with a review diff', async function (ctx) {
    const patch = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Update wording',
      operations: [
        {
          type: 'replace_text',
          path: 'main.tex',
          oldText: 'Old sentence.',
          newText: 'New sentence.',
        },
      ],
    })

    expect(ctx.AgentPatch.create).to.have.been.calledOnce
    expect(patch).to.include({
      id: 'patch-one',
      status: 'pending',
      summary: 'Update wording',
    })
    expect(patch.operations[0]).to.include({
      type: 'replace_text',
      path: '/main.tex',
      docId: 'doc-main',
      baseRev: 7,
    })
    expect(patch.operations[0].baseSha256).to.match(/^[a-f0-9]{64}$/)
    expect(patch.operations[0].diff.lines.map(line => line.type)).to.include(
      'remove'
    )
    expect(patch.operations[0].diff.lines.map(line => line.type)).to.include(
      'add'
    )
  })

  it('blocks patches to sensitive paths', async function (ctx) {
    await expect(
      ctx.PatchManager.createPatch({
        projectId: 'project-one',
        userId: 'user-one',
        sessionId: 'session-one',
        operations: [
          {
            type: 'replace_text',
            path: '渠道.txt',
            oldText: 'secret',
            newText: 'updated',
          },
        ],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)
  })

  it('applies a pending patch through DocumentUpdaterHandler', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Update wording',
      operations: [
        {
          type: 'replace_text',
          path: '/main.tex',
          oldText: 'Old sentence.',
          newText: 'New sentence.',
        },
      ],
    })

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been.calledWith(
      'project-one',
      'doc-main',
      'reviewer-one',
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'New sentence.',
        '\\end{document}',
      ],
      'agent'
    )
    expect(ctx.patchDocument.save).to.have.been.calledOnce
    expect(patch.status).to.equal('applied')
    expect(ctx.AgentEvent.create).to.have.been.calledTwice
  })

  it('marks a patch conflicted when the document changed', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      operations: [
        {
          type: 'replace_text',
          path: '/main.tex',
          oldText: 'Old sentence.',
          newText: 'New sentence.',
        },
      ],
    })
    ctx.docs['/main.tex'].lines[2] = 'Someone else changed this.'

    await expect(
      ctx.PatchManager.applyPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)
    expect(ctx.patchDocument.status).to.equal('conflicted')
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
  })
})
