import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
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
      save: sinon.stub().resolvesThis(),
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
    expect(ctx.project.save.called).to.equal(true)
    expect(result.workspaceRoot).to.equal(workspaceRoot)
    expect(result.checkpoint.commitHash).to.equal('a'.repeat(40))
  })
})
