import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentPluginInstallationManager.mjs'

describe('AiAgentPluginInstallationManager', function () {
  beforeEach(async function (ctx) {
    ctx.preview = {
      plugin: {
        id: 'latex-submission-check',
        name: 'latex-submission-check',
        version: '1.0.0',
        displayName: 'LaTeX 投稿检查',
        description: 'Submission checks.',
        manifestFormat: 'superpaper',
        manifestPath: '.superpaper-plugin/plugin.json',
        keywords: ['submission'],
      },
      manifest: {
        name: 'latex-submission-check',
        version: '1.0.0',
      },
      manifestFormat: 'superpaper',
      manifestPath: '.superpaper-plugin/plugin.json',
      skills: [
        {
          id: 'latex-submission-check/compile-debug',
          name: 'compile-debug',
          pluginId: 'latex-submission-check',
          displayName: 'Compile Debug',
          description: 'Diagnose compile errors.',
          modelInvocable: true,
          requiredTools: ['project.read_file'],
          keywords: ['submission', 'compile'],
          content: 'Read logs first.',
          sourcePath: 'skills/compile-debug/SKILL.md',
        },
      ],
      integrity: {
        sha256:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      packageBytes: 1024,
      fileCount: 2,
      warnings: [],
    }
    ctx.installation = {
      _id: 'install-one',
      scope: 'global',
      projectId: null,
      pluginId: 'latex-submission-check',
      name: 'latex-submission-check',
      version: '1.0.0',
      displayName: 'LaTeX 投稿检查',
      description: 'Submission checks.',
      enabled: true,
      status: 'installed',
      manifestFormat: 'superpaper',
      manifestPath: '.superpaper-plugin/plugin.json',
      source: {
        type: 'local_directory',
        pathHash:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      integrity: ctx.preview.integrity,
      packageBytes: 1024,
      fileCount: 2,
      skillIds: ['latex-submission-check/compile-debug'],
      warnings: [],
      installedBy: 'user-one',
      updatedBy: 'user-one',
      createdAt: null,
      updatedAt: null,
    }

    ctx.fs = {
      mkdir: sinon.stub().resolves(),
      rm: sinon.stub().resolves(),
      cp: sinon.stub().resolves(),
      mkdtemp: sinon.stub().resolves('/tmp/agent-plugin-one'),
      open: sinon.stub().resolves({
        write: sinon.stub().resolves(),
        close: sinon.stub().resolves(),
      }),
      rename: sinon.stub().resolves(),
      stat: sinon.stub().resolves({ isFile: () => true }),
    }
    ctx.AgentPluginInstallation = {
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          exec: sinon.stub().resolves([ctx.installation]),
        }),
      }),
      findOneAndUpdate: sinon.stub().returns({
        exec: sinon.stub().resolves(ctx.installation),
      }),
    }
    ctx.AgentPluginSetting = {
      updateOne: sinon.stub().returns({
        exec: sinon.stub().resolves({ acknowledged: true }),
      }),
    }
    ctx.AgentSkillSetting = {
      updateOne: sinon.stub().returns({
        exec: sinon.stub().resolves({ acknowledged: true }),
      }),
      updateMany: sinon.stub().returns({
        exec: sinon.stub().resolves({ acknowledged: true }),
      }),
    }
    ctx.previewPluginPackageFromDirectory = sinon.stub().resolves(ctx.preview)

    vi.doMock('node:fs/promises', () => ({
      default: ctx.fs,
    }))
    vi.doMock('@superpaper/settings', () => ({
      default: {
        path: {
          uploadFolder: '/data/uploads',
        },
      },
    }))
    vi.doMock('@superpaper/fetch-utils', () => ({
      fetchStream: (ctx.fetchStream = sinon.stub().callsFake(async function* () {
        yield Buffer.from('zip-bytes')
      })),
    }))
    vi.doMock('@superpaper/promise-utils', () => ({
      promisify: fn => fn,
    }))
    vi.doMock('../../../../app/src/Features/Uploads/ArchiveManager', () => ({
      default: {
        extractZipArchive: sinon.stub().resolves(),
        findTopLevelDirectory: sinon.stub().resolves('/tmp/top'),
      },
    }))
    vi.doMock(
      '../../../../app/src/models/AgentPluginInstallation',
      () => ({
        AgentPluginInstallation: ctx.AgentPluginInstallation,
      })
    )
    vi.doMock('../../../../app/src/models/AgentPluginSetting', () => ({
      AgentPluginSetting: ctx.AgentPluginSetting,
    }))
    vi.doMock('../../../../app/src/models/AgentSkillSetting', () => ({
      AgentSkillSetting: ctx.AgentSkillSetting,
    }))
    vi.doMock('../../../../app/src/infrastructure/mongodb', () => ({
      ObjectId: {
        isValid: value => /^[a-f0-9]{24}$/i.test(value),
      },
    }))
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPluginPackageManager',
      () => ({
        AgentPluginPackageValidationError: class AgentPluginPackageValidationError extends Error {
          constructor(message) {
            super(message)
            this.name = 'AgentPluginPackageValidationError'
          }
        },
        previewPluginPackageFromDirectory: ctx.previewPluginPackageFromDirectory,
      })
    )

    ctx.Manager = await import(modulePath)
  })

  it('previews a local directory package without exposing skill content', async function (ctx) {
    const preview = await ctx.Manager.previewAgentPluginPackage({
      sourceType: 'local_directory',
      path: '/srv/plugins/submission',
    })

    expect(ctx.previewPluginPackageFromDirectory).to.have.been.calledWith({
      directory: '/srv/plugins/submission',
    })
    expect(preview.source).to.include({
      type: 'local_directory',
    })
    expect(preview.source.pathHash).to.match(/^[a-f0-9]{64}$/)
    expect(preview.skills[0]).to.include({
      id: 'latex-submission-check/compile-debug',
      contentBytes: 16,
      sourcePath: 'skills/compile-debug/SKILL.md',
    })
    expect(preview.skills[0]).to.not.have.property('content')
  })

  it('installs a plugin and upserts plugin and skill settings', async function (ctx) {
    const installation = await ctx.Manager.installAgentPluginPackage({
      source: {
        sourceType: 'local_directory',
        path: '/srv/plugins/submission',
      },
      userId: 'user-one',
      enabled: true,
    })

    expect(ctx.fs.cp).to.have.been.calledWith(
      '/srv/plugins/submission',
      '/data/agent-plugins/latex-submission-check/1.0.0/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sinon.match({
        recursive: true,
        force: false,
      })
    )
    expect(ctx.AgentPluginInstallation.findOneAndUpdate).to.have.been.calledWith(
      {
        scope: 'global',
        projectId: null,
        pluginId: 'latex-submission-check',
        version: '1.0.0',
      },
      sinon.match({
        $set: sinon.match({
          name: 'latex-submission-check',
          enabled: true,
          status: 'installed',
          skillIds: ['latex-submission-check/compile-debug'],
          updatedBy: 'user-one',
        }),
      }),
      { upsert: true, new: true }
    )
    expect(ctx.AgentPluginSetting.updateOne).to.have.been.calledWith(
      { scope: 'global', projectId: null, pluginId: 'latex-submission-check' },
      sinon.match({
        $set: sinon.match({
          enabled: true,
          skills: ['latex-submission-check/compile-debug'],
        }),
      }),
      { upsert: true }
    )
    expect(ctx.AgentSkillSetting.updateOne).to.have.been.calledWith(
      {
        scope: 'global',
        projectId: null,
        skillId: 'latex-submission-check/compile-debug',
      },
      sinon.match({
        $set: sinon.match({
          enabled: true,
          content: 'Read logs first.',
          pluginId: 'latex-submission-check',
        }),
      }),
      { upsert: true }
    )
    expect(installation.pluginId).to.equal('latex-submission-check')
  })

  it('installs project-scoped plugins independently from global plugins', async function (ctx) {
    await ctx.Manager.installAgentPluginPackage({
      source: {
        sourceType: 'local_directory',
        path: '/srv/plugins/submission',
      },
      scope: 'project',
      projectId: '507f1f77bcf86cd799439011',
      userId: 'user-one',
      enabled: true,
    })

    expect(ctx.AgentPluginInstallation.findOneAndUpdate).to.have.been.calledWith(
      sinon.match({
        scope: 'project',
        projectId: '507f1f77bcf86cd799439011',
        pluginId: 'latex-submission-check',
        version: '1.0.0',
      }),
      sinon.match.any,
      sinon.match.any
    )
    expect(ctx.AgentPluginSetting.updateOne).to.have.been.calledWith(
      sinon.match({
        scope: 'project',
        projectId: '507f1f77bcf86cd799439011',
        pluginId: 'latex-submission-check',
      }),
      sinon.match.any,
      sinon.match.any
    )
    expect(ctx.AgentSkillSetting.updateOne).to.have.been.calledWith(
      sinon.match({
        scope: 'project',
        projectId: '507f1f77bcf86cd799439011',
        skillId: 'latex-submission-check/compile-debug',
      }),
      sinon.match.any,
      sinon.match.any
    )
  })

  it('normalizes GitHub plugin links to codeload archives', async function (ctx) {
    const preview = await ctx.Manager.previewAgentPluginPackage({
      sourceType: 'github',
      url: 'https://github.com/example/agent-plugin/tree/dev',
    })

    expect(ctx.fetchStream).to.have.been.calledWith(
      'https://codeload.github.com/example/agent-plugin/zip/refs/heads/dev'
    )
    expect(preview.source).to.deep.equal({
      type: 'github',
      url: 'https://github.com/example/agent-plugin/tree/dev',
      archiveUrl:
        'https://codeload.github.com/example/agent-plugin/zip/refs/heads/dev',
      ref: 'dev',
    })
  })

  it('stores uploaded zip packages and returns an installable upload id', async function (ctx) {
    const upload = await ctx.Manager.createUploadedAgentPluginPackage({
      filePath: '/tmp/uploaded-plugin.zip',
      originalName: 'agent-plugin.zip',
    })

    expect(ctx.fs.rename).to.have.been.calledWith(
      '/tmp/uploaded-plugin.zip',
      sinon.match(/^\/data\/agent-plugins\/uploads\/[a-f0-9-]{36}\.zip$/i)
    )
    expect(ctx.previewPluginPackageFromDirectory).to.have.been.called
    expect(upload.uploadId).to.match(/^[a-f0-9-]{36}$/i)
    expect(upload.originalName).to.equal('agent-plugin.zip')
    expect(upload.preview.source).to.include({
      type: 'uploaded_zip',
      uploadId: upload.uploadId,
      originalName: 'agent-plugin.zip',
    })
  })

  it('lists installed plugins', async function (ctx) {
    const installations = await ctx.Manager.listInstalledAgentPlugins()

    expect(ctx.AgentPluginInstallation.find).to.have.been.calledWith({
      scope: 'global',
      projectId: null,
    })
    expect(installations).to.deep.equal([
      {
        id: 'install-one',
        scope: 'global',
        projectId: null,
        pluginId: 'latex-submission-check',
        name: 'latex-submission-check',
        version: '1.0.0',
        displayName: 'LaTeX 投稿检查',
        description: 'Submission checks.',
        enabled: true,
        status: 'installed',
        manifestFormat: 'superpaper',
        manifestPath: '.superpaper-plugin/plugin.json',
        source: {
          type: 'local_directory',
          pathHash:
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
        integrity: ctx.preview.integrity,
        packageBytes: 1024,
        fileCount: 2,
        skillIds: ['latex-submission-check/compile-debug'],
        warnings: [],
        installedBy: 'user-one',
        updatedBy: 'user-one',
        createdAt: null,
        updatedAt: null,
      },
    ])
  })

  it('lists project-scoped installed plugins', async function (ctx) {
    await ctx.Manager.listInstalledAgentPlugins({
      scope: 'project',
      projectId: '507f1f77bcf86cd799439011',
    })

    expect(ctx.AgentPluginInstallation.find).to.have.been.calledWith({
      scope: 'project',
      projectId: '507f1f77bcf86cd799439011',
    })
  })

  it('toggles plugin and bundled skills together', async function (ctx) {
    await ctx.Manager.setInstalledAgentPluginEnabled({
      pluginId: 'latex-submission-check',
      enabled: false,
      userId: 'user-one',
    })

    expect(ctx.AgentPluginInstallation.findOneAndUpdate).to.have.been.calledWith(
      {
        scope: 'global',
        projectId: null,
        pluginId: 'latex-submission-check',
      },
      {
        $set: {
          enabled: false,
          status: 'disabled',
          updatedBy: 'user-one',
        },
      },
      { new: true, sort: { updatedAt: -1 } }
    )
    expect(ctx.AgentPluginSetting.updateOne).to.have.been.calledWith(
      { scope: 'global', projectId: null, pluginId: 'latex-submission-check' },
      { $set: { enabled: false, updatedBy: 'user-one' } }
    )
    expect(ctx.AgentSkillSetting.updateMany).to.have.been.calledWith(
      { scope: 'global', projectId: null, pluginId: 'latex-submission-check' },
      { $set: { enabled: false, updatedBy: 'user-one' } }
    )
  })
})
