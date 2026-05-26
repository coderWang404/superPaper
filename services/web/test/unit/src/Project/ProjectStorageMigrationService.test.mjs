import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { Readable } from 'node:stream'
import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/Project/ProjectStorageMigrationService.mjs'

describe('ProjectStorageMigrationService', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-migration-')
    )
    ctx.project = {
      _id: 'project-1',
      name: 'Migrated Paper',
      rootDoc_id: 'doc-main',
      compiler: 'pdflatex',
      storageBackend: 'mongo',
      workspace: {},
    }
    ctx.docs = {
      '/main.tex': {
        _id: 'doc-main',
        lines: ['\\documentclass{article}', '\\begin{document}', 'Hi'],
        rev: 3,
      },
      '/sections/intro.tex': {
        _id: 'doc-intro',
        lines: ['Intro'],
        rev: 1,
      },
    }
    ctx.files = {
      '/figures/plot.pdf': {
        _id: 'file-1',
        name: 'plot.pdf',
        hash: 'abc123',
      },
    }
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    vi.doMock('../../../../app/src/Features/Project/ProjectGetter.mjs', () => ({
      default: {
        promises: {
          getProject: sinon.stub().resolves(ctx.project),
        },
      },
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler.mjs',
      () => ({
        default: {
          promises: {
            getAllDocs: sinon.stub().resolves(ctx.docs),
            getAllFiles: sinon.stub().resolves(ctx.files),
          },
        },
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectCheckpointService.mjs',
      () => ({
        default: {
          createCheckpoint: sinon.stub().resolves({
            commitHash: 'a'.repeat(40),
          }),
        },
      })
    )
    ctx.HistoryManager = {
      promises: {
        requestBlobWithProjectId: sinon.stub().resolves({
          stream: Readable.from([Buffer.from([0, 1, 2, 255])]),
          contentLength: 4,
        }),
      },
    }
    ctx.ProjectUpdateQuery = {
      exec: sinon.stub().resolves({ matchedCount: 1 }),
    }
    ctx.ProjectModel = {
      updateOne: sinon.stub().returns(ctx.ProjectUpdateQuery),
    }
    vi.doMock('../../../../app/src/models/Project.mjs', () => ({
      Project: ctx.ProjectModel,
    }))
    vi.doMock('../../../../app/src/Features/History/HistoryManager.mjs', () => ({
      default: ctx.HistoryManager,
    }))
    ctx.ProjectStorageMigrationService = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('exports docs and project metadata into a workspace', async function (ctx) {
    const result =
      await ctx.ProjectStorageMigrationService.migrateProjectToFilesystem({
        projectId: 'project-1',
        userId: 'user-1',
      })

    const workspaceRoot = path.join(ctx.tmpRoot, 'project-1', 'workspace')
    expect(
      await fs.readFile(path.join(workspaceRoot, 'main.tex'), 'utf8')
    ).to.equal('\\documentclass{article}\n\\begin{document}\nHi')
    expect(
      await fs.readFile(path.join(workspaceRoot, 'sections', 'intro.tex'), 'utf8')
    ).to.equal('Intro')
    expect(
      await fs.readFile(path.join(workspaceRoot, 'figures', 'plot.pdf'))
    ).to.deep.equal(Buffer.from([0, 1, 2, 255]))
    expect(
      ctx.HistoryManager.promises.requestBlobWithProjectId
    ).to.have.been.calledWith('project-1', 'abc123', 'GET')
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(workspaceRoot, '.superpaper', 'project.json'),
          'utf8'
        )
      )
    ).to.include({
      projectId: 'project-1',
      name: 'Migrated Paper',
      rootDocId: 'doc-main',
      compiler: 'pdflatex',
    })
    expect(ctx.project.storageBackend).to.equal('filesystem')
    expect(ctx.project.workspace.rootPath).to.equal(workspaceRoot)
    expect(ctx.ProjectModel.updateOne).to.have.been.calledWith(
      { _id: 'project-1' },
      {
        $set: {
          storageBackend: 'filesystem',
          workspace: {
            rootPath: workspaceRoot,
            migratedAt: sinon.match.date,
            finalizedAt: null,
          },
        },
      }
    )
    expect(ctx.ProjectUpdateQuery.exec.called).to.equal(true)
    expect(result.workspaceRoot).to.equal(workspaceRoot)
    expect(result.checkpoint.commitHash).to.equal('a'.repeat(40))
  })

  it('persists migration metadata for raw project records', async function (ctx) {
    expect(ctx.project.save).to.equal(undefined)

    await ctx.ProjectStorageMigrationService.migrateProjectToFilesystem({
      projectId: 'project-1',
      userId: 'user-1',
    })

    expect(ctx.ProjectModel.updateOne.calledOnce).to.equal(true)
  })
})
