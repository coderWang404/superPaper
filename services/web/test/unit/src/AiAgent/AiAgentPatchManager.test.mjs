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
        getAllFiles: sinon.stub().resolves({}),
      },
    }
    ctx.DocumentUpdaterHandler = {
      promises: {
        setDocument: sinon.stub().resolves({ rev: 8, modified: true }),
      },
    }
    ctx.CompileManager = {
      promises: {
        compile: sinon.stub().resolves({
          status: 'success',
          buildId: 'build-one',
          outputFiles: [{ path: 'output.pdf', type: 'pdf', size: 123 }],
          validationProblems: [],
          timings: { compileE2E: 42 },
        }),
      },
    }
    ctx.EditorController = {
      promises: {
        upsertDocWithPath: sinon.stub().resolves({
          doc: { _id: 'doc-created' },
          folder: { _id: 'folder-one' },
        }),
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
    vi.doMock('../../../../app/src/Features/Compile/CompileManager', () => ({
      default: ctx.CompileManager,
    }))
    vi.doMock('../../../../app/src/Features/Editor/EditorController', () => ({
      default: ctx.EditorController,
    }))
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

  it('creates pending create_doc patches for new text documents', async function (ctx) {
    const patch = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Create methods section',
      operations: [
        {
          type: 'create_doc',
          path: 'sections/methods.tex',
          content: '\\section{Methods}',
        },
      ],
    })

    expect(patch.operations[0]).to.include({
      type: 'create_doc',
      path: '/sections/methods.tex',
      content: '\\section{Methods}',
    })
    expect(patch.baseRevision['/sections/methods.tex']).to.deep.equal({
      docId: null,
      sha256: null,
      exists: false,
    })
    expect(patch.operations[0].diff.lines).to.deep.include({
      type: 'add',
      content: '\\section{Methods}',
    })
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
    expect(ctx.CompileManager.promises.compile).to.have.been.calledWith(
      'project-one',
      'reviewer-one',
      {
        isAutoCompile: false,
        fileLineErrors: true,
        stopOnFirstError: false,
      }
    )
    expect(patch.compileResult).to.include({
      ok: true,
      status: 'success',
      buildId: 'build-one',
    })
    expect(ctx.AgentEvent.create).to.have.callCount(4)
  })

  it('applies create_doc patches through EditorController', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Create methods section',
      operations: [
        {
          type: 'create_doc',
          path: '/sections/methods.tex',
          content: '\\section{Methods}',
        },
      ],
    })

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.upsertDocWithPath).to.have.been.calledWith(
      'project-one',
      '/sections/methods.tex',
      ['\\section{Methods}'],
      'agent',
      'reviewer-one'
    )
    expect(patch.status).to.equal('applied')
    expect(patch.compileResult.status).to.equal('success')
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

  it('rejects pending patches without applying project changes', async function (ctx) {
    const patch = await ctx.PatchManager.rejectPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.patchDocument.status).to.equal('rejected')
    expect(ctx.patchDocument.rejectedByUserId).to.equal('reviewer-one')
    expect(ctx.patchDocument.save).to.have.been.calledOnce
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'approval_response',
        payload: {
          patchId: 'patch-one',
          status: 'rejected',
        },
      })
    )
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.EditorController.promises.upsertDocWithPath).to.not.have.been
      .called
    expect(ctx.CompileManager.promises.compile).to.not.have.been.called
    expect(patch.status).to.equal('rejected')
  })
})
