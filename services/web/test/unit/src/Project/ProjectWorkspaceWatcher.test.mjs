import { expect, vi } from 'vitest'
import sinon from 'sinon'

const MODULE_PATH =
  '../../../../app/src/Features/Project/ProjectWorkspaceWatcher.mjs'

describe('ProjectWorkspaceWatcher', function () {
  beforeEach(async function (ctx) {
    vi.useFakeTimers()
    ctx.ProjectFileStore = {
      listFiles: sinon.stub().resolves([]),
      readTextFile: sinon.stub(),
    }
    ctx.DocumentUpdaterHandler = {
      promises: {
        setDocument: sinon.stub().resolves({}),
      },
    }
    ctx.ProjectEntityHandler = {
      promises: {
        getFilesystemDocIdForPath: sinon
          .stub()
          .callsFake(async (projectId, projectPath) =>
            projectPath === '/main.tex' ? 'doc-main' : 'doc-intro'
          ),
      },
    }
    ctx.EditorRealTimeController = {
      emitToRoom: sinon.stub(),
    }
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectFileStore.mjs',
      () => ({
        default: ctx.ProjectFileStore,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Editor/EditorRealTimeController.mjs',
      () => ({
        default: ctx.EditorRealTimeController,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs',
      () => ({
        default: ctx.DocumentUpdaterHandler,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler.mjs',
      () => ({
        default: ctx.ProjectEntityHandler,
      })
    )
    ctx.ProjectWorkspaceWatcher = (await import(MODULE_PATH)).default
  })

  afterEach(function () {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('emits a coalesced filesystem change when files are added', async function (ctx) {
    ctx.ProjectFileStore.listFiles.onFirstCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
    ])
    ctx.ProjectFileStore.listFiles.onSecondCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
      { projectPath: '/sections/intro.tex', bytes: 5, type: 'doc' },
    ])

    await ctx.ProjectWorkspaceWatcher.start('project-1', { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
      'project-1',
      'project:filesystem:changed',
      {
        projectId: 'project-1',
        changedPaths: ['/sections/intro.tex'],
        reason: 'workspace-files-changed',
      }
    )
  })

  it('emits changed and deleted paths', async function (ctx) {
    ctx.ProjectFileStore.listFiles.onFirstCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
      { projectPath: '/old.tex', bytes: 3, type: 'doc' },
    ])
    ctx.ProjectFileStore.listFiles.onSecondCall().resolves([
      { projectPath: '/main.tex', bytes: 8, type: 'doc' },
    ])

    await ctx.ProjectWorkspaceWatcher.start('project-1', { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
      'project-1',
      'project:filesystem:changed',
      {
        projectId: 'project-1',
        changedPaths: ['/main.tex', '/old.tex'],
        reason: 'workspace-files-changed',
      }
    )
  })

  it('detects same-size text edits and syncs changed docs to document-updater', async function (ctx) {
    ctx.ProjectFileStore.listFiles.onFirstCall().resolves([
      {
        projectPath: '/main.tex',
        bytes: 4,
        type: 'doc',
        sha256: 'old-sha',
      },
    ])
    ctx.ProjectFileStore.listFiles.onSecondCall().resolves([
      {
        projectPath: '/main.tex',
        bytes: 4,
        type: 'doc',
        sha256: 'new-sha',
      },
    ])
    ctx.ProjectFileStore.readTextFile.resolves({
      projectPath: '/main.tex',
      content: 'BETA',
    })

    await ctx.ProjectWorkspaceWatcher.start('project-1', { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(ctx.ProjectFileStore.readTextFile).to.have.been.calledWith({
      projectId: 'project-1',
      projectPath: '/main.tex',
    })
    expect(
      ctx.ProjectEntityHandler.promises.getFilesystemDocIdForPath
    ).to.have.been.calledWith('project-1', '/main.tex')
    expect(
      ctx.DocumentUpdaterHandler.promises.setDocument
    ).to.have.been.calledWith(
      'project-1',
      'doc-main',
      null,
      ['BETA'],
      { kind: 'filesystem-workspace-sync' }
    )
    expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
      'project-1',
      'project:filesystem:changed',
      {
        projectId: 'project-1',
        changedPaths: ['/main.tex'],
        reason: 'workspace-files-changed',
      }
    )
  })

  it('stops polling a project', async function (ctx) {
    ctx.ProjectFileStore.listFiles.onFirstCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
    ])
    ctx.ProjectFileStore.listFiles.onSecondCall().resolves([
      { projectPath: '/main.tex', bytes: 5, type: 'doc' },
    ])

    await ctx.ProjectWorkspaceWatcher.start('project-1', { intervalMs: 1000 })
    ctx.ProjectWorkspaceWatcher.stop('project-1')
    await vi.advanceTimersByTimeAsync(1000)

    expect(ctx.EditorRealTimeController.emitToRoom).not.to.have.been.called
  })
})
