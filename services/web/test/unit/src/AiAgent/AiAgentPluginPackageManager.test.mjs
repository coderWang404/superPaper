import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect } from 'vitest'

import {
  AgentPluginPackageValidationError,
  previewPluginPackageFromDirectory,
} from '../../../../app/src/Features/AiAgent/AiAgentPluginPackageManager.mjs'

describe('AiAgentPluginPackageManager', function () {
  beforeEach(async function (ctx) {
    ctx.root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-plugin-'))
  })

  afterEach(async function (ctx) {
    await fs.rm(ctx.root, { recursive: true, force: true })
  })

  it('previews a native superPaper plugin package', async function (ctx) {
    await writePlugin(ctx.root, {
      manifestDirectory: '.superpaper-plugin',
      manifest: {
        schemaVersion: 'superpaper.agent.plugin.v1',
        name: 'latex-submission-check',
        version: '1.2.0',
        description: 'Check projects before submission.',
        interface: {
          displayName: 'LaTeX 投稿检查',
        },
        keywords: ['submission'],
      },
      skillName: 'compile-debug',
      frontmatter: [
        'name: compile-debug',
        'description: Diagnose compile errors.',
        'displayName: Compile Debug',
        'requiredTools: [project.read_file, compile.get_last_result]',
        'keywords:',
        '  - compile',
        '  - error',
      ].join('\n'),
      content: 'Read the latest compile log before proposing a patch.',
    })

    const preview = await previewPluginPackageFromDirectory({
      directory: ctx.root,
    })

    expect(preview.plugin).to.include({
      id: 'latex-submission-check',
      name: 'latex-submission-check',
      version: '1.2.0',
      displayName: 'LaTeX 投稿检查',
      description: 'Check projects before submission.',
      manifestFormat: 'superpaper',
      manifestPath: '.superpaper-plugin/plugin.json',
    })
    expect(preview.integrity.sha256).to.match(/^[a-f0-9]{64}$/)
    expect(preview.fileCount).to.equal(2)
    expect(preview.skills).to.deep.include({
      id: 'latex-submission-check/compile-debug',
      name: 'compile-debug',
      pluginId: 'latex-submission-check',
      displayName: 'Compile Debug',
      description: 'Diagnose compile errors.',
      modelInvocable: true,
      requiredTools: ['project.read_file', 'compile.get_last_result'],
      keywords: ['submission', 'compile', 'error'],
      content: 'Read the latest compile log before proposing a patch.',
      sourcePath: 'skills/compile-debug/SKILL.md',
    })
  })

  it('previews a Codex plugin safe subset', async function (ctx) {
    await writePlugin(ctx.root, {
      manifestDirectory: '.codex-plugin',
      manifest: {
        name: 'codex-style-plugin',
        version: '0.1.0',
        description: 'Style guide skills.',
        interface: {
          displayName: 'Codex Style',
        },
        skills: 'skills',
      },
      skillName: 'style-guide',
      frontmatter: [
        'name: style-guide',
        'description: Apply project style guidance.',
      ].join('\n'),
      content: 'Use concise academic English.',
    })

    const preview = await previewPluginPackageFromDirectory({
      directory: ctx.root,
    })

    expect(preview.plugin.manifestFormat).to.equal('codex')
    expect(preview.plugin.displayName).to.equal('Codex Style')
    expect(preview.skills.map(skill => skill.id)).to.deep.equal([
      'codex-style-plugin/style-guide',
    ])
  })

  it('rejects manifest executable capabilities', async function (ctx) {
    await writePlugin(ctx.root, {
      manifestDirectory: '.superpaper-plugin',
      manifest: {
        name: 'unsafe-plugin',
        version: '1.0.0',
        hooks: [{ command: 'npm test' }],
      },
    })

    await expect(
      previewPluginPackageFromDirectory({ directory: ctx.root })
    ).to.be.rejectedWith(
      AgentPluginPackageValidationError,
      'Agent plugin manifest contains executable capability: hooks'
    )
  })

  it('rejects executable capability paths', async function (ctx) {
    await writePlugin(ctx.root, {
      manifestDirectory: '.superpaper-plugin',
      manifest: {
        name: 'unsafe-plugin',
        version: '1.0.0',
      },
    })
    await fs.mkdir(path.join(ctx.root, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(ctx.root, 'scripts/run.sh'), 'echo no\n')

    await expect(
      previewPluginPackageFromDirectory({ directory: ctx.root })
    ).to.be.rejectedWith(
      AgentPluginPackageValidationError,
      'Plugin package contains executable capability path: scripts/run.sh'
    )
  })

  it('rejects symlinks', async function (ctx) {
    await writePlugin(ctx.root, {
      manifestDirectory: '.superpaper-plugin',
      manifest: {
        name: 'unsafe-plugin',
        version: '1.0.0',
      },
    })
    await fs.symlink('/etc/passwd', path.join(ctx.root, 'skills/link'))

    await expect(
      previewPluginPackageFromDirectory({ directory: ctx.root })
    ).to.be.rejectedWith(
      AgentPluginPackageValidationError,
      'Plugin package must not contain symlinks: skills/link'
    )
  })

  it('rejects unknown required tools in skills', async function (ctx) {
    await writePlugin(ctx.root, {
      manifestDirectory: '.superpaper-plugin',
      manifest: {
        name: 'unsafe-plugin',
        version: '1.0.0',
      },
      skillName: 'shell-helper',
      frontmatter: [
        'name: shell-helper',
        'description: Unsafe helper.',
        'requiredTools: [shell.run]',
      ].join('\n'),
      content: 'Run a command.',
    })

    await expect(
      previewPluginPackageFromDirectory({ directory: ctx.root })
    ).to.be.rejectedWith(
      AgentPluginPackageValidationError,
      'Unknown agent tool required by skill shell-helper: shell.run'
    )
  })

  it('rejects invalid plugin names', async function (ctx) {
    await writePlugin(ctx.root, {
      manifestDirectory: '.superpaper-plugin',
      manifest: {
        name: 'Unsafe_Plugin',
        version: '1.0.0',
      },
    })

    await expect(
      previewPluginPackageFromDirectory({ directory: ctx.root })
    ).to.be.rejectedWith(
      AgentPluginPackageValidationError,
      'Plugin name must be lower-case kebab-case'
    )
  })
})

async function writePlugin(
  root,
  {
    manifestDirectory,
    manifest,
    skillName = 'compile-debug',
    frontmatter = 'name: compile-debug\ndescription: Diagnose compile errors.',
    content = 'Read compile logs.',
  }
) {
  await fs.mkdir(path.join(root, manifestDirectory), { recursive: true })
  await fs.writeFile(
    path.join(root, manifestDirectory, 'plugin.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
  await fs.mkdir(path.join(root, 'skills', skillName), { recursive: true })
  await fs.writeFile(
    path.join(root, 'skills', skillName, 'SKILL.md'),
    `---\n${frontmatter}\n---\n\n${content}\n`
  )
}
