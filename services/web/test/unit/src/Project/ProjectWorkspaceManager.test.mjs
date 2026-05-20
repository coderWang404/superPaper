import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { expect } from 'vitest'
import { vi } from 'vitest'
import { Project } from '../../../../app/src/models/Project.mjs'

const modulePath =
  '../../../../app/src/Features/Project/ProjectWorkspaceManager.mjs'

describe('Project workspace storage metadata', function () {
  it('defaults projects to the mongo storage backend', function () {
    const project = new Project({ name: 'Paper' })

    expect(project.storageBackend).to.equal('mongo')
    expect(project.workspace.rootPath).to.equal(null)
    expect(project.workspace.migratedAt).to.equal(null)
    expect(project.workspace.finalizedAt).to.equal(null)
  })
})

describe('ProjectWorkspaceManager', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-workspaces-')
    )
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    ctx.ProjectWorkspaceManager = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('resolves the workspace root for a project id', function (ctx) {
    expect(ctx.ProjectWorkspaceManager.getWorkspaceRoot('project-123')).to.equal(
      path.join(ctx.tmpRoot, 'project-123', 'workspace')
    )
  })

  it('normalizes relative project paths to POSIX absolute paths', function (ctx) {
    expect(
      ctx.ProjectWorkspaceManager.normalizeProjectPath('main.tex')
    ).to.equal('/main.tex')
    expect(
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/sections/intro.tex')
    ).to.equal('/sections/intro.tex')
    expect(
      ctx.ProjectWorkspaceManager.normalizeProjectPath('sections//intro.tex')
    ).to.equal('/sections/intro.tex')
  })

  it('rejects traversal paths', function (ctx) {
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('../secret.tex')
    ).to.throw('Project path escapes the workspace')
  })

  it('rejects internal paths', function (ctx) {
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/.git/config')
    ).to.throw('Project path is internal')
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath(
        '/.superpaper/project.json'
      )
    ).to.throw('Project path is internal')
  })

  it('rejects sensitive paths', function (ctx) {
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/.env')
    ).to.throw('Project path is sensitive')
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/credentials.json')
    ).to.throw('Project path is sensitive')
  })

  it('resolves a contained absolute filesystem path', async function (ctx) {
    const resolved = await ctx.ProjectWorkspaceManager.resolveProjectPath({
      projectId: 'project-123',
      projectPath: '/sections/intro.tex',
    })

    expect(resolved.projectPath).to.equal('/sections/intro.tex')
    expect(resolved.absolutePath).to.equal(
      path.join(ctx.tmpRoot, 'project-123', 'workspace', 'sections', 'intro.tex')
    )
  })
})
