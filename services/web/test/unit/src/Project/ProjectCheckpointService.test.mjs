import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { expect, vi } from 'vitest'

const modulePath =
  '../../../../app/src/Features/Project/ProjectCheckpointService.mjs'

describe('ProjectCheckpointService', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-checkpoints-')
    )
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    vi.doMock('../../../../app/src/models/ProjectCheckpoint.mjs', () => ({
      ProjectCheckpoint: (ctx.ProjectCheckpoint = {
        create: vi.fn(async checkpoint => ({
          _id: 'checkpoint-id',
          createdAt: new Date('2026-05-20T00:00:00Z'),
          ...checkpoint,
        })),
      }),
    }))
    ctx.ProjectCheckpointService = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('initializes git and creates a checkpoint commit', async function (ctx) {
    const workspaceRoot = path.join(ctx.tmpRoot, 'project-1', 'workspace')
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, 'main.tex'), 'hello\n')

    const checkpoint = await ctx.ProjectCheckpointService.createCheckpoint({
      projectId: 'project-1',
      actorType: 'migration',
      actorUserId: 'user-1',
      summary: 'Initial migration',
    })

    expect(checkpoint.commitHash).to.match(/^[a-f0-9]{40}$/)
    expect(ctx.ProjectCheckpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        actorType: 'migration',
        actorUserId: 'user-1',
        summary: 'Initial migration',
        commitHash: checkpoint.commitHash,
      })
    )
  })

  it('returns a diff between checkpoints and the worktree', async function (ctx) {
    const workspaceRoot = path.join(ctx.tmpRoot, 'project-1', 'workspace')
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, 'main.tex'), 'hello\n')
    await ctx.ProjectCheckpointService.createCheckpoint({
      projectId: 'project-1',
      actorType: 'migration',
      summary: 'Initial migration',
    })
    await fs.writeFile(path.join(workspaceRoot, 'main.tex'), 'hello world\n')

    const diff = await ctx.ProjectCheckpointService.diffWorktree({
      projectId: 'project-1',
    })

    expect(diff).to.contain('-hello')
    expect(diff).to.contain('+hello world')
  })
})
