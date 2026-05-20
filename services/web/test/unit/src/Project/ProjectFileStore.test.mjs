import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { expect, vi } from 'vitest'

const modulePath = '../../../../app/src/Features/Project/ProjectFileStore.mjs'

describe('ProjectFileStore', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-file-store-')
    )
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    ctx.ProjectFileStore = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('writes and reads a UTF-8 text file', async function (ctx) {
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/main.tex',
      content: '\\documentclass{article}\n',
    })

    const file = await ctx.ProjectFileStore.readTextFile({
      projectId: 'project-1',
      projectPath: '/main.tex',
    })

    expect(file).to.include({
      projectPath: '/main.tex',
      content: '\\documentclass{article}\n',
    })
    expect(file.bytes).to.equal(Buffer.byteLength(file.content))
    expect(file.sha256).to.match(/^[a-f0-9]{64}$/)
  })

  it('lists visible files and hides internal directories', async function (ctx) {
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/main.tex',
      content: 'main',
    })
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/sections/intro.tex',
      content: 'intro',
    })
    await fs.mkdir(
      path.join(ctx.tmpRoot, 'project-1', 'workspace', '.superpaper'),
      { recursive: true }
    )
    await fs.writeFile(
      path.join(
        ctx.tmpRoot,
        'project-1',
        'workspace',
        '.superpaper',
        'project.json'
      ),
      '{}'
    )

    const files = await ctx.ProjectFileStore.listFiles({ projectId: 'project-1' })

    expect(files.map(file => file.projectPath)).to.deep.equal([
      '/main.tex',
      '/sections/intro.tex',
    ])
  })

  it('renames and deletes files', async function (ctx) {
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/old.tex',
      content: 'hello',
    })

    await ctx.ProjectFileStore.renameFile({
      projectId: 'project-1',
      fromPath: '/old.tex',
      toPath: '/new.tex',
    })
    await expect(
      ctx.ProjectFileStore.readTextFile({
        projectId: 'project-1',
        projectPath: '/old.tex',
      })
    ).to.be.rejectedWith('Project file not found')
    expect(
      (
        await ctx.ProjectFileStore.readTextFile({
          projectId: 'project-1',
          projectPath: '/new.tex',
        })
      ).content
    ).to.equal('hello')

    await ctx.ProjectFileStore.deleteFile({
      projectId: 'project-1',
      projectPath: '/new.tex',
    })
    await expect(
      ctx.ProjectFileStore.readTextFile({
        projectId: 'project-1',
        projectPath: '/new.tex',
      })
    ).to.be.rejectedWith('Project file not found')
  })
})
