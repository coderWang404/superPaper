import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentPatchManager.mjs'

async function createMultiHunkReplacePatch(ctx) {
  ctx.docs['/main.tex'].lines = [
    'First old sentence.',
    '',
    'Second old sentence.',
  ]
  await ctx.PatchManager.createPatch({
    projectId: 'project-one',
    userId: 'user-one',
    sessionId: 'session-one',
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'First old sentence.\n\nSecond old sentence.',
        newText: 'First new sentence.\n\nSecond new sentence.',
      },
    ],
  })
  ctx.patchDocument.operations[0].hunks = [
    {
      type: 'text',
      path: '/main.tex',
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      oldText: 'First old sentence.',
      newText: 'First new sentence.',
      diff: {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: [
          { type: 'remove', content: 'First old sentence.' },
          { type: 'add', content: 'First new sentence.' },
        ],
      },
    },
    {
      type: 'text',
      path: '/main.tex',
      oldStart: 3,
      oldLines: 1,
      newStart: 3,
      newLines: 1,
      oldText: 'Second old sentence.',
      newText: 'Second new sentence.',
      diff: {
        oldStart: 3,
        oldLines: 1,
        newStart: 3,
        newLines: 1,
        lines: [
          { type: 'remove', content: 'Second old sentence.' },
          { type: 'add', content: 'Second new sentence.' },
        ],
      },
    },
  ]
  return ctx.PatchManager.publicPatch(ctx.patchDocument)
}

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
        deleteEntity: sinon.stub().resolves(),
        renameEntity: sinon.stub().resolves(),
        mkdirp: sinon.stub().resolves({
          newFolders: [{ _id: 'folder-sections' }],
          lastFolder: { _id: 'folder-sections' },
        }),
        moveEntity: sinon.stub().resolves(),
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

  it('returns stable hunk ids for pending text patches', async function (ctx) {
    const patch = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Update intro',
      operations: [
        {
          type: 'replace_text',
          path: '/main.tex',
          oldText: 'Old sentence.',
          newText: 'New sentence.',
        },
      ],
    })

    const firstPublicPatch = ctx.PatchManager.publicPatch(ctx.patchDocument)
    const secondPublicPatch = ctx.PatchManager.publicPatch(ctx.patchDocument)

    expect(patch.operations[0].id).to.equal('op-0001')
    expect(patch.operations[0]).to.include({ status: 'pending' })
    expect(patch.operations[0].hunks).to.have.length(1)
    expect(patch.operations[0].hunks[0].id).to.match(
      /^op-0001:h-0001:[a-f0-9]{12}$/
    )
    expect(patch.operations[0].hunks[0]).to.deep.include({
      operationId: 'op-0001',
      operationIndex: 0,
      hunkIndex: 0,
      type: 'text',
      path: '/main.tex',
      status: 'pending',
      oldText: 'Old sentence.',
      newText: 'New sentence.',
    })
    expect(secondPublicPatch.operations[0].hunks[0].id).to.equal(
      firstPublicPatch.operations[0].hunks[0].id
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

  it('represents structural operations as single hunks', async function (ctx) {
    const patch = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      operations: [
        {
          type: 'create_doc',
          path: '/appendix.tex',
          content: 'Appendix text',
        },
      ],
    })

    expect(patch.operations[0]).to.include({
      id: 'op-0001',
      status: 'pending',
    })
    expect(patch.operations[0].hunks).to.have.length(1)
    expect(patch.operations[0].hunks[0]).to.deep.include({
      operationId: 'op-0001',
      operationIndex: 0,
      hunkIndex: 0,
      type: 'create_doc',
      path: '/appendix.tex',
      status: 'pending',
      oldText: '',
      newText: 'Appendix text',
    })
  })

  it('creates pending delete_doc patches with a removal diff', async function (ctx) {
    const patch = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Remove obsolete note',
      operations: [
        {
          type: 'delete_doc',
          path: 'main.tex',
        },
      ],
    })

    expect(patch.riskLevel).to.equal('high')
    expect(patch.operations[0]).to.include({
      type: 'delete_doc',
      path: '/main.tex',
      docId: 'doc-main',
      baseRev: 7,
    })
    expect(patch.baseRevision['/main.tex']).to.deep.include({
      docId: 'doc-main',
      rev: 7,
    })
    expect(patch.operations[0].baseSha256).to.match(/^[a-f0-9]{64}$/)
    expect(patch.operations[0].diff.lines.map(line => line.type)).to.include(
      'remove'
    )
  })

  it('creates pending rename_entity patches with a path diff', async function (ctx) {
    const patch = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Rename main document',
      operations: [
        {
          type: 'rename_entity',
          path: 'main.tex',
          newName: 'paper.tex',
        },
      ],
    })

    expect(patch.riskLevel).to.equal('medium')
    expect(patch.operations[0]).to.include({
      type: 'rename_entity',
      entityType: 'doc',
      path: '/main.tex',
      newName: 'paper.tex',
      newPath: '/paper.tex',
      docId: 'doc-main',
      baseRev: 7,
    })
    expect(patch.operations[0].baseSha256).to.match(/^[a-f0-9]{64}$/)
    expect(patch.operations[0].diff.lines).to.deep.include({
      type: 'remove',
      content: '/main.tex',
    })
    expect(patch.operations[0].diff.lines).to.deep.include({
      type: 'add',
      content: '/paper.tex',
    })
  })

  it('creates pending move_entity patches with a path diff', async function (ctx) {
    const patch = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Move main document',
      operations: [
        {
          type: 'move_entity',
          path: 'main.tex',
          targetFolderPath: '/sections',
        },
      ],
    })

    expect(patch.riskLevel).to.equal('medium')
    expect(patch.operations[0]).to.include({
      type: 'move_entity',
      entityType: 'doc',
      path: '/main.tex',
      targetFolderPath: '/sections',
      newPath: '/sections/main.tex',
      docId: 'doc-main',
      baseRev: 7,
    })
    expect(patch.operations[0].baseSha256).to.match(/^[a-f0-9]{64}$/)
    expect(patch.operations[0].diff.lines).to.deep.include({
      type: 'remove',
      content: '/main.tex',
    })
    expect(patch.operations[0].diff.lines).to.deep.include({
      type: 'add',
      content: '/sections/main.tex',
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
    ctx.patchDocument.save.resetHistory()

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
    expect(patch.operations[0].status).to.equal('applied')
    expect(patch.operations[0].hunks[0].status).to.equal('applied')
    expect(patch.rollbackAvailable).to.equal(true)
    expect(ctx.patchDocument.rollbackOperations).to.have.length(1)
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

  it('applies only selected hunks and leaves other hunks pending', async function (ctx) {
    ctx.docs['/appendix.tex'] = {
      _id: 'doc-appendix',
      lines: ['Appendix old sentence.'],
      rev: 3,
    }
    const created = await ctx.PatchManager.createPatch({
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
        {
          type: 'replace_text',
          path: '/appendix.tex',
          oldText: 'Appendix old sentence.',
          newText: 'Appendix new sentence.',
        },
      ],
    })
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.patchDocument.save.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.AgentEvent.create.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been
      .calledOnce
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
    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].status).to.equal('applied')
    expect(patch.operations[0].hunks[0].status).to.equal('applied')
    expect(patch.operations[1].status).to.equal('pending')
    expect(patch.operations[1].hunks[0].status).to.equal('pending')
    expect(ctx.patchDocument.rollbackOperations[0]).to.include({
      hunkId: selectedHunkId,
      operationId: 'op-0001',
    })
    expect(ctx.AgentSession.updateOne).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'patch_applied',
        payload: sinon.match({
          hunkIds: [selectedHunkId],
        }),
      })
    )
  })

  it('applies one selected text hunk from a multi-hunk operation', async function (ctx) {
    const created = await createMultiHunkReplacePatch(ctx)
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.patchDocument.save.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been
      .calledOnce
    expect(ctx.DocumentUpdaterHandler.promises.setDocument.firstCall.args[3])
      .to.deep.equal(['First new sentence.', '', 'Second old sentence.'])
    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].status).to.equal('partially_applied')
    expect(patch.operations[0].hunks[0].status).to.equal('applied')
    expect(patch.operations[0].hunks[1].status).to.equal('pending')
    expect(ctx.patchDocument.rollbackOperations[0]).to.include({
      hunkId: selectedHunkId,
      operationId: 'op-0001',
    })
  })

  it('applies all pending text hunks from a multi-hunk operation in order', async function (ctx) {
    const created = await createMultiHunkReplacePatch(ctx)
    ctx.patchDocument.save.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: created.operations[0].hunks.map(hunk => hunk.id),
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been
      .calledTwice
    expect(ctx.DocumentUpdaterHandler.promises.setDocument.firstCall.args[3])
      .to.deep.equal(['First new sentence.', '', 'Second old sentence.'])
    expect(ctx.DocumentUpdaterHandler.promises.setDocument.secondCall.args[3])
      .to.deep.equal(['First new sentence.', '', 'Second new sentence.'])
    expect(patch.status).to.equal('applied')
    expect(patch.operations[0].status).to.equal('applied')
    expect(patch.operations[0].hunks.map(hunk => hunk.status)).to.deep.equal([
      'applied',
      'applied',
    ])
    expect(ctx.patchDocument.rollbackOperations.map(operation => operation.hunkId))
      .to.deep.equal(created.operations[0].hunks.map(hunk => hunk.id))
  })

  it('applies a remaining text hunk from a partially applied multi-hunk operation', async function (ctx) {
    const created = await createMultiHunkReplacePatch(ctx)
    const firstHunkId = created.operations[0].hunks[0].id
    const secondHunkId = created.operations[0].hunks[1].id

    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [firstHunkId],
    })
    expect(ctx.patchDocument.status).to.equal('partially_applied')
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [secondHunkId],
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been
      .calledOnce
    expect(ctx.DocumentUpdaterHandler.promises.setDocument.firstCall.args[3])
      .to.deep.equal(['First new sentence.', '', 'Second new sentence.'])
    expect(patch.status).to.equal('applied')
    expect(patch.operations[0].hunks.map(hunk => hunk.status)).to.deep.equal([
      'applied',
      'applied',
    ])
    expect(ctx.patchDocument.rollbackOperations.map(operation => operation.hunkId))
      .to.deep.equal([firstHunkId, secondHunkId])
    expect(ctx.AgentSession.updateOne).to.have.been.calledOnce
  })

  it('applies a later pending text hunk after an earlier hunk from the operation was rolled back', async function (ctx) {
    const created = await createMultiHunkReplacePatch(ctx)
    const firstHunkId = created.operations[0].hunks[0].id
    const secondHunkId = created.operations[0].hunks[1].id

    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [firstHunkId],
    })
    ctx.docs['/main.tex'].lines = [
      'First new sentence.',
      '',
      'Second old sentence.',
    ]
    await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [firstHunkId],
    })
    ctx.docs['/main.tex'].lines = [
      'First old sentence.',
      '',
      'Second old sentence.',
    ]
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [secondHunkId],
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been
      .calledOnce
    expect(ctx.DocumentUpdaterHandler.promises.setDocument.firstCall.args[3])
      .to.deep.equal(['First old sentence.', '', 'Second new sentence.'])
    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].hunks[0].status).to.equal('rolled_back')
    expect(patch.operations[0].hunks[1].status).to.equal('applied')
    expect(ctx.AgentSession.updateOne).to.have.been.calledOnce
  })

  it('rejects unknown hunk ids before applying writes', async function (ctx) {
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
    ctx.patchDocument.save.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()

    await expect(
      ctx.PatchManager.applyPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: ['op-9999:h-0001:missing'],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(ctx.patchDocument.status).to.equal('pending')
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.patchDocument.save).to.not.have.been.called
  })

  it('rejects duplicate selected hunk ids before applying writes', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
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
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.patchDocument.save.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()

    await expect(
      ctx.PatchManager.applyPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [selectedHunkId, selectedHunkId],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.patchDocument.save).to.not.have.been.called
  })

  it('applies remaining pending hunks without replaying applied hunks', async function (ctx) {
    ctx.docs['/appendix.tex'] = {
      _id: 'doc-appendix',
      lines: ['Appendix old sentence.'],
      rev: 3,
    }
    const created = await ctx.PatchManager.createPatch({
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
        {
          type: 'replace_text',
          path: '/appendix.tex',
          oldText: 'Appendix old sentence.',
          newText: 'Appendix new sentence.',
        },
      ],
    })
    const selectedHunkId = created.operations[0].hunks[0].id

    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })
    expect(ctx.patchDocument.rollbackOperations).to.have.length(1)
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been.calledOnce
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been.calledWith(
      'project-one',
      'doc-appendix',
      'reviewer-one',
      ['Appendix new sentence.'],
      'agent'
    )
    expect(patch.status).to.equal('applied')
    expect(patch.operations[0].hunks[0].status).to.equal('applied')
    expect(patch.operations[1].hunks[0].status).to.equal('applied')
    expect(ctx.patchDocument.rollbackOperations).to.have.length(2)
    expect(ctx.patchDocument.rollbackOperations[0]).to.include({
      hunkId: selectedHunkId,
      operationId: 'op-0001',
    })
    expect(ctx.patchDocument.rollbackOperations[1]).to.include({
      hunkId: created.operations[1].hunks[0].id,
      operationId: 'op-0002',
    })
    expect(ctx.AgentSession.updateOne).to.have.been.calledOnce
  })

  it('can reject unselected hunks during selected apply', async function (ctx) {
    ctx.docs['/appendix.tex'] = {
      _id: 'doc-appendix',
      lines: ['Appendix old sentence.'],
      rev: 3,
    }
    const created = await ctx.PatchManager.createPatch({
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
        {
          type: 'replace_text',
          path: '/appendix.tex',
          oldText: 'Appendix old sentence.',
          newText: 'Appendix new sentence.',
        },
      ],
    })
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.patchDocument.save.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
      rejectUnselected: true,
    })

    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].hunks[0].status).to.equal('applied')
    expect(patch.operations[1].status).to.equal('rejected')
    expect(patch.operations[1].hunks[0].status).to.equal('rejected')
    expect(ctx.AgentSession.updateOne).to.have.been.calledOnce
  })

  it('applies selected structural hunks', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
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
        {
          type: 'create_doc',
          path: '/appendix.tex',
          content: 'Appendix text',
        },
      ],
    })
    const selectedHunkId = created.operations[1].hunks[0].id
    ctx.patchDocument.save.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.EditorController.promises.upsertDocWithPath.resetHistory()

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.EditorController.promises.upsertDocWithPath).to.have.been.calledWith(
      'project-one',
      '/appendix.tex',
      ['Appendix text'],
      'agent',
      'reviewer-one'
    )
    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].hunks[0].status).to.equal('pending')
    expect(patch.operations[1].hunks[0].status).to.equal('applied')
    expect(ctx.patchDocument.rollbackOperations[0]).to.include({
      hunkId: selectedHunkId,
      operationId: 'op-0002',
    })
  })

  it('preflights all selected hunks before applying writes', async function (ctx) {
    ctx.docs['/appendix.tex'] = {
      _id: 'doc-appendix',
      lines: ['Appendix old sentence.'],
      rev: 3,
    }
    const created = await ctx.PatchManager.createPatch({
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
        {
          type: 'replace_text',
          path: '/appendix.tex',
          oldText: 'Appendix old sentence.',
          newText: 'Appendix new sentence.',
        },
      ],
    })
    ctx.docs['/appendix.tex'].lines = ['Changed before review.']
    ctx.patchDocument.save.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()

    await expect(
      ctx.PatchManager.applyPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [
          created.operations[0].hunks[0].id,
          created.operations[1].hunks[0].id,
        ],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.patchDocument.status).to.equal('conflicted')
  })

  it('rolls back applied replace_text patches through DocumentUpdaterHandler', async function (ctx) {
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
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/main.tex'].lines[2] = 'New sentence.'
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.CompileManager.promises.compile.resetHistory()

    const patch = await ctx.PatchManager.rollbackPatch({
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
        'Old sentence.',
        '\\end{document}',
      ],
      'agent-rollback'
    )
    expect(patch.status).to.equal('rolled_back')
    expect(patch.rollbackAvailable).to.equal(false)
    expect(patch.compileResult.status).to.equal('success')
    expect(ctx.CompileManager.promises.compile).to.have.been.calledOnce
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'patch_rolled_back',
        payload: {
          patchId: 'patch-one',
          operations: [
            {
              type: 'restore_doc_text',
              path: '/main.tex',
              currentPath: undefined,
              docId: 'doc-main',
            },
          ],
        },
      })
    )
  })

  it('rolls back only selected applied text hunks', async function (ctx) {
    ctx.docs['/main.tex'].lines = ['Main old sentence.']
    ctx.docs['/appendix.tex'] = {
      _id: 'doc-appendix',
      lines: ['Appendix old sentence.'],
      rev: 3,
    }
    const created = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      operations: [
        {
          type: 'replace_text',
          path: '/main.tex',
          oldText: 'Main old sentence.',
          newText: 'Main new sentence.',
        },
        {
          type: 'replace_text',
          path: '/appendix.tex',
          oldText: 'Appendix old sentence.',
          newText: 'Appendix new sentence.',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/main.tex'].lines = ['Main new sentence.']
    ctx.docs['/appendix.tex'].lines = ['Appendix new sentence.']
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.EditorController.promises.deleteEntity.resetHistory()
    ctx.CompileManager.promises.compile.resetHistory()

    const patch = await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been.calledOnce
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been.calledWith(
      'project-one',
      'doc-main',
      'reviewer-one',
      ['Main old sentence.'],
      'agent-rollback'
    )
    expect(ctx.EditorController.promises.deleteEntity).to.not.have.been.called
    expect(patch.status).to.equal('partially_applied')
    expect(patch.rollbackAvailable).to.equal(true)
    expect(patch.operations[0].hunks[0].status).to.equal('rolled_back')
    expect(patch.operations[1].hunks[0].status).to.equal('applied')
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'patch_rolled_back',
        payload: sinon.match({
          patchId: 'patch-one',
          hunkIds: [selectedHunkId],
        }),
      })
    )
  })

  it('rolls back the last selected text hunk from a multi-hunk operation', async function (ctx) {
    const created = await createMultiHunkReplacePatch(ctx)
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: created.operations[0].hunks.map(hunk => hunk.id),
    })
    ctx.docs['/main.tex'].lines = [
      'First new sentence.',
      '',
      'Second new sentence.',
    ]
    const selectedHunkId = created.operations[0].hunks[1].id
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.CompileManager.promises.compile.resetHistory()

    const patch = await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been
      .calledOnce
    expect(ctx.DocumentUpdaterHandler.promises.setDocument.firstCall.args[3])
      .to.deep.equal(['First new sentence.', '', 'Second old sentence.'])
    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].status).to.equal('partially_applied')
    expect(patch.operations[0].hunks[0].status).to.equal('applied')
    expect(patch.operations[0].hunks[1].status).to.equal('rolled_back')
    expect(patch.rollbackAvailable).to.equal(true)
  })

  it('blocks rolling back an earlier text hunk while later hunks from the operation remain applied', async function (ctx) {
    const created = await createMultiHunkReplacePatch(ctx)
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: created.operations[0].hunks.map(hunk => hunk.id),
    })
    ctx.docs['/main.tex'].lines = [
      'First new sentence.',
      '',
      'Second new sentence.',
    ]
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.patchDocument.save.resetHistory()

    let error
    try {
      await ctx.PatchManager.rollbackPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [selectedHunkId],
      })
    } catch (err) {
      error = err
    }

    expect(error).to.be.instanceOf(ctx.PatchManager.AiAgentPatchError)
    expect(error).to.include({
      code: 'AGENT_PATCH_HUNK_DEPENDENCY',
    })

    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.patchDocument.save).to.not.have.been.called
  })

  it('rolls back selected hunks in reverse applied order', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      operations: [
        {
          type: 'create_doc',
          path: '/first.tex',
          content: 'First',
        },
        {
          type: 'create_doc',
          path: '/second.tex',
          content: 'Second',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/first.tex'] = {
      _id: 'doc-first',
      lines: ['First'],
      rev: 1,
    }
    ctx.docs['/second.tex'] = {
      _id: 'doc-second',
      lines: ['Second'],
      rev: 1,
    }
    ctx.patchDocument.rollbackOperations[0].docId = 'doc-first'
    ctx.patchDocument.rollbackOperations[1].docId = 'doc-second'
    ctx.EditorController.promises.deleteEntity.resetHistory()

    await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [
        created.operations[0].hunks[0].id,
        created.operations[1].hunks[0].id,
      ],
    })

    expect(ctx.EditorController.promises.deleteEntity).to.have.been.calledTwice
    expect(ctx.EditorController.promises.deleteEntity.firstCall).to.have.been.calledWith(
      'project-one',
      'doc-second',
      'doc',
      'agent-rollback',
      'reviewer-one'
    )
    expect(ctx.EditorController.promises.deleteEntity.secondCall).to.have.been.calledWith(
      'project-one',
      'doc-first',
      'doc',
      'agent-rollback',
      'reviewer-one'
    )
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

  it('rolls back applied create_doc patches by deleting the created doc', async function (ctx) {
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
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/sections/methods.tex'] = {
      _id: 'doc-created',
      lines: ['\\section{Methods}'],
      rev: 1,
    }
    ctx.EditorController.promises.deleteEntity.resetHistory()

    const patch = await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.deleteEntity).to.have.been.calledWith(
      'project-one',
      'doc-created',
      'doc',
      'agent-rollback',
      'reviewer-one'
    )
    expect(patch.status).to.equal('rolled_back')
  })

  it('rolls back selected create_doc hunks by deleting only the selected doc', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Create sections',
      operations: [
        {
          type: 'create_doc',
          path: '/sections/methods.tex',
          content: '\\section{Methods}',
        },
        {
          type: 'create_doc',
          path: '/sections/results.tex',
          content: '\\section{Results}',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/sections/methods.tex'] = {
      _id: 'doc-methods',
      lines: ['\\section{Methods}'],
      rev: 1,
    }
    ctx.docs['/sections/results.tex'] = {
      _id: 'doc-results',
      lines: ['\\section{Results}'],
      rev: 1,
    }
    ctx.patchDocument.rollbackOperations[0].docId = 'doc-methods'
    ctx.patchDocument.rollbackOperations[1].docId = 'doc-results'
    ctx.EditorController.promises.deleteEntity.resetHistory()
    const selectedHunkId = created.operations[0].hunks[0].id

    const patch = await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(ctx.EditorController.promises.deleteEntity).to.have.been.calledOnce
    expect(ctx.EditorController.promises.deleteEntity).to.have.been.calledWith(
      'project-one',
      'doc-methods',
      'doc',
      'agent-rollback',
      'reviewer-one'
    )
    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].hunks[0].status).to.equal('rolled_back')
    expect(patch.operations[1].hunks[0].status).to.equal('applied')
  })

  it('rejects unknown selected rollback hunks before writing', async function (ctx) {
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
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/main.tex'].lines[2] = 'New sentence.'
    ctx.patchDocument.save.resetHistory()
    ctx.AgentEvent.create.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.CompileManager.promises.compile.resetHistory()

    const error = await expect(
      ctx.PatchManager.rollbackPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: ['op-9999:h-0001:missing'],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(error.code).to.equal('AGENT_PATCH_HUNK_NOT_FOUND')
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.patchDocument.save).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.not.have.been.called
    expect(ctx.CompileManager.promises.compile).to.not.have.been.called
  })

  it('rejects duplicate selected rollback hunks before writing', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
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
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.docs['/main.tex'].lines[2] = 'New sentence.'
    ctx.patchDocument.save.resetHistory()
    ctx.AgentEvent.create.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.CompileManager.promises.compile.resetHistory()

    const error = await expect(
      ctx.PatchManager.rollbackPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [selectedHunkId, selectedHunkId],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(error.code).to.equal('AGENT_PATCH_DUPLICATE_HUNK')
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.patchDocument.save).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.not.have.been.called
    expect(ctx.CompileManager.promises.compile).to.not.have.been.called
  })

  it('rejects not-applied selected rollback hunks before writing', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
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
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.patchDocument.save.resetHistory()
    ctx.AgentEvent.create.resetHistory()
    ctx.DocumentUpdaterHandler.promises.setDocument.resetHistory()
    ctx.CompileManager.promises.compile.resetHistory()

    const error = await expect(
      ctx.PatchManager.rollbackPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [selectedHunkId],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(error.code).to.equal('AGENT_PATCH_HUNK_NOT_APPLIED')
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.patchDocument.save).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.not.have.been.called
    expect(ctx.CompileManager.promises.compile).to.not.have.been.called
  })

  it('preflights all selected rollback hunks before writing', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      operations: [
        {
          type: 'create_doc',
          path: '/first.tex',
          content: 'First',
        },
        {
          type: 'create_doc',
          path: '/second.tex',
          content: 'Second',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/first.tex'] = {
      _id: 'doc-first',
      lines: ['First'],
      rev: 1,
    }
    ctx.docs['/second.tex'] = {
      _id: 'doc-second',
      lines: ['Changed'],
      rev: 2,
    }
    ctx.patchDocument.rollbackOperations[0].docId = 'doc-first'
    ctx.patchDocument.rollbackOperations[1].docId = 'doc-second'
    ctx.patchDocument.save.resetHistory()
    ctx.AgentEvent.create.resetHistory()
    ctx.EditorController.promises.deleteEntity.resetHistory()
    ctx.CompileManager.promises.compile.resetHistory()

    const error = await expect(
      ctx.PatchManager.rollbackPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [
          created.operations[0].hunks[0].id,
          created.operations[1].hunks[0].id,
        ],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(error.code).to.equal('AGENT_PATCH_ROLLBACK_CONFLICT')
    expect(ctx.EditorController.promises.deleteEntity).to.not.have.been.called
    expect(ctx.patchDocument.save).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.not.have.been.called
    expect(ctx.CompileManager.promises.compile).to.not.have.been.called
  })

  it('applies delete_doc patches through EditorController', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Remove obsolete note',
      operations: [
        {
          type: 'delete_doc',
          path: '/main.tex',
        },
      ],
    })

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.deleteEntity).to.have.been.calledWith(
      'project-one',
      'doc-main',
      'doc',
      'agent',
      'reviewer-one'
    )
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(patch.status).to.equal('applied')
    expect(patch.compileResult.status).to.equal('success')
  })

  it('rolls back applied delete_doc patches by restoring the deleted doc', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Remove obsolete note',
      operations: [
        {
          type: 'delete_doc',
          path: '/main.tex',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    delete ctx.docs['/main.tex']
    ctx.EditorController.promises.upsertDocWithPath.resetHistory()

    const patch = await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.upsertDocWithPath).to.have.been.calledWith(
      'project-one',
      '/main.tex',
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'Old sentence.',
        '\\end{document}',
      ],
      'agent-rollback',
      'reviewer-one'
    )
    expect(patch.status).to.equal('rolled_back')
  })

  it('applies rename_entity patches through EditorController', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Rename main document',
      operations: [
        {
          type: 'rename_entity',
          path: '/main.tex',
          newName: 'paper.tex',
        },
      ],
    })

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.renameEntity).to.have.been.calledWith(
      'project-one',
      'doc-main',
      'doc',
      'paper.tex',
      'reviewer-one',
      'agent'
    )
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(patch.status).to.equal('applied')
    expect(patch.compileResult.status).to.equal('success')
  })

  it('rolls back applied rename_entity patches by restoring the old name', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Rename main document',
      operations: [
        {
          type: 'rename_entity',
          path: '/main.tex',
          newName: 'paper.tex',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/paper.tex'] = ctx.docs['/main.tex']
    delete ctx.docs['/main.tex']
    ctx.EditorController.promises.renameEntity.resetHistory()

    const patch = await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.renameEntity).to.have.been.calledWith(
      'project-one',
      'doc-main',
      'doc',
      'main.tex',
      'reviewer-one',
      'agent-rollback'
    )
    expect(patch.status).to.equal('rolled_back')
  })

  it('applies move_entity patches through EditorController', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Move main document',
      operations: [
        {
          type: 'move_entity',
          path: '/main.tex',
          targetFolderPath: '/sections',
        },
      ],
    })

    const patch = await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.mkdirp).to.have.been.calledWith(
      'project-one',
      '/sections',
      'reviewer-one'
    )
    expect(ctx.EditorController.promises.moveEntity).to.have.been.calledWith(
      'project-one',
      'doc-main',
      'folder-sections',
      'doc',
      'reviewer-one',
      'agent'
    )
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(patch.status).to.equal('applied')
    expect(patch.compileResult.status).to.equal('success')
  })

  it('rolls back applied move_entity patches by moving the doc back', async function (ctx) {
    await ctx.PatchManager.createPatch({
      projectId: 'project-one',
      userId: 'user-one',
      sessionId: 'session-one',
      summary: 'Move main document',
      operations: [
        {
          type: 'move_entity',
          path: '/main.tex',
          targetFolderPath: '/sections',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })
    ctx.docs['/sections/main.tex'] = ctx.docs['/main.tex']
    delete ctx.docs['/main.tex']
    ctx.EditorController.promises.mkdirp.resetHistory()
    ctx.EditorController.promises.mkdirp.resolves({
      newFolders: [],
      folder: { _id: 'root-folder' },
    })
    ctx.EditorController.promises.moveEntity.resetHistory()

    const patch = await ctx.PatchManager.rollbackPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
    })

    expect(ctx.EditorController.promises.mkdirp).to.have.been.calledWith(
      'project-one',
      '/',
      'reviewer-one'
    )
    expect(ctx.EditorController.promises.moveEntity).to.have.been.calledWith(
      'project-one',
      'doc-main',
      'root-folder',
      'doc',
      'reviewer-one',
      'agent-rollback'
    )
    expect(patch.status).to.equal('rolled_back')
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
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'patch_rejected',
        payload: sinon.match({
          patchId: 'patch-one',
        }),
      })
    )
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.EditorController.promises.upsertDocWithPath).to.not.have.been
      .called
    expect(ctx.EditorController.promises.deleteEntity).to.not.have.been.called
    expect(ctx.EditorController.promises.renameEntity).to.not.have.been.called
    expect(ctx.EditorController.promises.moveEntity).to.not.have.been.called
    expect(ctx.CompileManager.promises.compile).to.not.have.been.called
    expect(patch.status).to.equal('rejected')
  })

  it('rejects only selected pending hunks', async function (ctx) {
    ctx.docs['/appendix.tex'] = {
      _id: 'doc-appendix',
      lines: ['Appendix old sentence.'],
      rev: 3,
    }
    const created = await ctx.PatchManager.createPatch({
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
        {
          type: 'replace_text',
          path: '/appendix.tex',
          oldText: 'Appendix old sentence.',
          newText: 'Appendix new sentence.',
        },
      ],
    })
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.patchDocument.save.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const patch = await ctx.PatchManager.rejectPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(patch.status).to.equal('pending')
    expect(patch.operations[0].status).to.equal('rejected')
    expect(patch.operations[0].hunks[0].status).to.equal('rejected')
    expect(patch.operations[1].status).to.equal('pending')
    expect(patch.operations[1].hunks[0].status).to.equal('pending')
    expect(ctx.patchDocument.rejectedByUserId).to.equal('reviewer-one')
    expect(ctx.patchDocument.save).to.have.been.calledOnce
    expect(ctx.AgentSession.updateOne).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'approval_response',
        payload: {
          patchId: 'patch-one',
          status: 'rejected',
          hunkIds: [selectedHunkId],
        },
      })
    )
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'patch_rejected',
        payload: {
          patchId: 'patch-one',
          hunkIds: [selectedHunkId],
        },
      })
    )
    expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
      .called
    expect(ctx.EditorController.promises.upsertDocWithPath).to.not.have.been
      .called
  })

  it('rejects one selected pending hunk from a multi-hunk operation', async function (ctx) {
    const created = await createMultiHunkReplacePatch(ctx)
    const selectedHunkId = created.operations[0].hunks[1].id
    ctx.patchDocument.save.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const patch = await ctx.PatchManager.rejectPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })

    expect(patch.status).to.equal('pending')
    expect(patch.operations[0].status).to.equal('pending')
    expect(patch.operations[0].hunks[0].status).to.equal('pending')
    expect(patch.operations[0].hunks[1].status).to.equal('rejected')
    expect(ctx.patchDocument.save).to.have.been.calledOnce
    expect(ctx.AgentSession.updateOne).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'patch_rejected',
        payload: {
          patchId: 'patch-one',
          hunkIds: [selectedHunkId],
        },
      })
    )
  })

  it('completes the session after rejecting the last pending hunk', async function (ctx) {
    ctx.docs['/appendix.tex'] = {
      _id: 'doc-appendix',
      lines: ['Appendix old sentence.'],
      rev: 3,
    }
    const created = await ctx.PatchManager.createPatch({
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
        {
          type: 'replace_text',
          path: '/appendix.tex',
          oldText: 'Appendix old sentence.',
          newText: 'Appendix new sentence.',
        },
      ],
    })
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [created.operations[0].hunks[0].id],
    })
    ctx.patchDocument.save.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const patch = await ctx.PatchManager.rejectPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [created.operations[1].hunks[0].id],
    })

    expect(patch.status).to.equal('partially_applied')
    expect(patch.operations[0].hunks[0].status).to.equal('applied')
    expect(patch.operations[1].hunks[0].status).to.equal('rejected')
    expect(ctx.AgentSession.updateOne).to.have.been.calledOnce
  })

  it('rejects unknown selected reject hunks before saving', async function (ctx) {
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
    ctx.patchDocument.save.resetHistory()
    ctx.AgentEvent.create.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const error = await expect(
      ctx.PatchManager.rejectPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: ['op-9999:h-0001:missing'],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(error.code).to.equal('AGENT_PATCH_HUNK_NOT_FOUND')
    expect(ctx.patchDocument.status).to.equal('pending')
    expect(ctx.patchDocument.save).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.not.have.been.called
    expect(ctx.AgentSession.updateOne).to.not.have.been.called
  })

  it('rejects duplicate selected reject hunks before saving', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
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
    const selectedHunkId = created.operations[0].hunks[0].id
    ctx.patchDocument.save.resetHistory()
    ctx.AgentEvent.create.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const error = await expect(
      ctx.PatchManager.rejectPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [selectedHunkId, selectedHunkId],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(error.code).to.equal('AGENT_PATCH_DUPLICATE_HUNK')
    expect(ctx.patchDocument.save).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.not.have.been.called
    expect(ctx.AgentSession.updateOne).to.not.have.been.called
  })

  it('rejects already applied selected hunks before saving', async function (ctx) {
    const created = await ctx.PatchManager.createPatch({
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
    const selectedHunkId = created.operations[0].hunks[0].id
    await ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: [selectedHunkId],
    })
    ctx.patchDocument.save.resetHistory()
    ctx.AgentEvent.create.resetHistory()
    ctx.AgentSession.updateOne.resetHistory()

    const error = await expect(
      ctx.PatchManager.rejectPatch({
        projectId: 'project-one',
        userId: 'reviewer-one',
        patchId: 'patch-one',
        hunkIds: [selectedHunkId],
      })
    ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)

    expect(error.code).to.equal('AGENT_PATCH_HUNK_NOT_PENDING')
    expect(ctx.patchDocument.save).to.not.have.been.called
    expect(ctx.AgentEvent.create).to.not.have.been.called
    expect(ctx.AgentSession.updateOne).to.not.have.been.called
  })
})
