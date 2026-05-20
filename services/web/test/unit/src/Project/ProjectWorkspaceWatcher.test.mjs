import { expect, vi } from 'vitest'
import sinon from 'sinon'

const MODULE_PATH =
  '../../../../app/src/Features/Project/ProjectWorkspaceWatcher.mjs'

describe('ProjectWorkspaceWatcher', function () {
  beforeEach(async function (ctx) {
    vi.useFakeTimers()
    ctx.ProjectFileStore = {
      listFiles: sinon.stub().resolves([]),
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
