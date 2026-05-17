import { expect, vi } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.mjs'
import MockResponse from '../helpers/MockResponse.mjs'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentSettingsController.mjs'

function jsonBody(res) {
  return JSON.parse(res.body)
}

describe('AiAgentSettingsController', function () {
  beforeEach(async function (ctx) {
    ctx.config = {
      permissionProfile: { id: 'project-agent-default' },
      skills: [],
      plugins: [],
      enabledSkillIds: [],
      enabledPluginIds: [],
    }
    ctx.SettingsManager = {
      AgentSettingsValidationError:
        class AgentSettingsValidationError extends Error {
          constructor(message) {
            super(message)
            this.name = 'AgentSettingsValidationError'
          }
        },
      getAgentConfig: sinon.stub().resolves(ctx.config),
      updateAgentSettings: sinon.stub().resolves(ctx.config),
    }
    ctx.PluginInstallationManager = {
      AgentPluginInstallationError: class AgentPluginInstallationError extends Error {
        constructor(code, message) {
          super(message)
          this.name = 'AgentPluginInstallationError'
          this.code = code
        }
      },
      installAgentPluginPackage: sinon.stub().resolves({
        pluginId: 'latex-submission-check',
        name: 'latex-submission-check',
        version: '1.0.0',
        enabled: true,
        status: 'installed',
        skillIds: ['latex-submission-check/compile-debug'],
        source: { type: 'zip_url', url: 'https://example.test/plugin.zip' },
        integrity: { sha256: 'abc123' },
      }),
      listInstalledAgentPlugins: sinon.stub().resolves([
        {
          pluginId: 'latex-submission-check',
          version: '1.0.0',
          enabled: true,
        },
      ]),
      previewAgentPluginPackage: sinon.stub().resolves({
        plugin: {
          id: 'latex-submission-check',
          version: '1.0.0',
        },
        skills: [],
      }),
      setInstalledAgentPluginEnabled: sinon.stub().resolves({
        pluginId: 'latex-submission-check',
        name: 'latex-submission-check',
        version: '1.0.0',
        enabled: false,
        status: 'disabled',
        skillIds: ['latex-submission-check/compile-debug'],
        source: { type: 'zip_url', url: 'https://example.test/plugin.zip' },
        integrity: { sha256: 'abc123' },
      }),
      summarizePluginInstallation: plugin => ({
        pluginId: plugin.pluginId,
        version: plugin.version,
        enabled: plugin.enabled,
        status: plugin.status,
        skillCount: plugin.skillIds?.length || 0,
        sourceType: plugin.source?.type || null,
        integrity: plugin.integrity?.sha256 || null,
      }),
    }
    ctx.PluginPackageManager = {
      AgentPluginPackageValidationError:
        class AgentPluginPackageValidationError extends Error {
          constructor(message) {
            super(message)
            this.name = 'AgentPluginPackageValidationError'
          }
        },
    }
    ctx.SessionManager = {
      getLoggedInUserId: sinon.stub().returns('user-one'),
    }
    ctx.ProjectAuditLogHandler = {
      addEntryInBackground: sinon.stub(),
    }
    ctx.UserAuditLogHandler = {
      addEntryInBackground: sinon.stub(),
    }

    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentSettingsManager',
      () => ctx.SettingsManager
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPluginInstallationManager',
      () => ctx.PluginInstallationManager
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPluginPackageManager',
      () => ctx.PluginPackageManager
    )
    vi.doMock(
      '../../../../app/src/Features/Authentication/SessionManager',
      () => ({
        default: ctx.SessionManager,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectAuditLogHandler',
      () => ({
        default: ctx.ProjectAuditLogHandler,
      })
    )
    vi.doMock('../../../../app/src/Features/User/UserAuditLogHandler', () => ({
      default: ctx.UserAuditLogHandler,
    }))

    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.req.ip = '127.0.0.1'
    ctx.req.params.Project_id = 'project-one'
    ctx.res = new MockResponse(vi)
    ctx.next = sinon.stub()
  })

  it('returns project agent config', async function (ctx) {
    await ctx.Controller.projectConfig(ctx.req, ctx.res, ctx.next)

    expect(ctx.SettingsManager.getAgentConfig).to.have.been.calledWith({
      projectId: 'project-one',
    })
    expect(jsonBody(ctx.res)).to.deep.equal(ctx.config)
  })

  it('updates project settings and records an audit summary without content', async function (ctx) {
    ctx.req.body = {
      skills: [{ id: 'academic-polish', enabled: false }],
      plugins: [{ id: 'latex-core', enabled: true }],
      instructionProfiles: [
        {
          name: 'Project Agent Rules',
          content: 'Do not reveal secrets.',
          enabled: true,
        },
      ],
    }

    await ctx.Controller.updateProjectSettings(ctx.req, ctx.res, ctx.next)

    expect(ctx.SettingsManager.updateAgentSettings).to.have.been.calledWith({
      scope: 'project',
      projectId: 'project-one',
      userId: 'user-one',
      skills: [{ id: 'academic-polish', enabled: false }],
      plugins: [{ id: 'latex-core', enabled: true }],
      instructionProfiles: [
        {
          name: 'Project Agent Rules',
          content: 'Do not reveal secrets.',
          enabled: true,
        },
      ],
    })
    expect(ctx.ProjectAuditLogHandler.addEntryInBackground).to.have.been.calledWith(
      'project-one',
      'agent-settings-changed',
      'user-one',
      '127.0.0.1',
      {
        skills: [{ id: 'academic-polish', enabled: false }],
        plugins: [{ id: 'latex-core', enabled: true }],
        instructionProfiles: [
          {
            name: 'Project Agent Rules',
            enabled: true,
            bytes: 22,
          },
        ],
      }
    )
    expect(jsonBody(ctx.res)).to.deep.equal(ctx.config)
  })

  it('rejects executable plugin manifest settings', async function (ctx) {
    ctx.SettingsManager.updateAgentSettings.rejects(
      new ctx.SettingsManager.AgentSettingsValidationError(
        'Agent plugin manifest contains executable capability: hooks'
      )
    )
    ctx.req.body = {
      plugins: [
        {
          id: 'unsafe',
          enabled: true,
          manifest: { hooks: ['exec'] },
        },
      ],
    }

    await ctx.Controller.updateProjectSettings(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Agent plugin manifest contains executable capability: hooks',
      },
    })
  })

  it('lists globally installed plugins', async function (ctx) {
    await ctx.Controller.listGlobalPlugins(ctx.req, ctx.res, ctx.next)

    expect(ctx.PluginInstallationManager.listInstalledAgentPlugins).to.have.been
      .called
    expect(jsonBody(ctx.res)).to.deep.equal({
      plugins: [
        {
          pluginId: 'latex-submission-check',
          version: '1.0.0',
          enabled: true,
        },
      ],
    })
  })

  it('previews an external plugin source', async function (ctx) {
    ctx.req.body = {
      sourceType: 'zip_url',
      url: 'https://example.test/plugin.zip',
    }

    await ctx.Controller.previewGlobalPlugin(ctx.req, ctx.res, ctx.next)

    expect(ctx.PluginInstallationManager.previewAgentPluginPackage).to.have.been
      .calledWith({
        sourceType: 'zip_url',
        url: 'https://example.test/plugin.zip',
      })
    expect(jsonBody(ctx.res)).to.deep.equal({
      preview: {
        plugin: {
          id: 'latex-submission-check',
          version: '1.0.0',
        },
        skills: [],
      },
    })
  })

  it('installs an external plugin and records a user audit summary', async function (ctx) {
    ctx.req.body = {
      sourceType: 'zip_url',
      url: 'https://example.test/plugin.zip',
      enabled: true,
    }

    await ctx.Controller.installGlobalPlugin(ctx.req, ctx.res, ctx.next)

    expect(ctx.PluginInstallationManager.installAgentPluginPackage).to.have.been
      .calledWith({
        source: {
          sourceType: 'zip_url',
          url: 'https://example.test/plugin.zip',
          enabled: true,
        },
        userId: 'user-one',
        enabled: true,
      })
    expect(ctx.UserAuditLogHandler.addEntryInBackground).to.have.been.calledWith(
      'user-one',
      'agent-plugin-installed',
      'user-one',
      '127.0.0.1',
      {
        pluginId: 'latex-submission-check',
        version: '1.0.0',
        enabled: true,
        status: 'installed',
        skillCount: 1,
        sourceType: 'zip_url',
        integrity: 'abc123',
      }
    )
    expect(jsonBody(ctx.res).config).to.deep.equal(ctx.config)
  })

  it('updates an installed plugin enabled state', async function (ctx) {
    ctx.req.params.pluginId = 'latex-submission-check'
    ctx.req.body = {
      enabled: false,
    }

    await ctx.Controller.setGlobalPluginEnabled(ctx.req, ctx.res, ctx.next)

    expect(ctx.PluginInstallationManager.setInstalledAgentPluginEnabled).to.have
      .been.calledWith({
        pluginId: 'latex-submission-check',
        enabled: false,
        userId: 'user-one',
      })
    expect(ctx.UserAuditLogHandler.addEntryInBackground).to.have.been.calledWith(
      'user-one',
      'agent-plugin-enabled-changed',
      'user-one',
      '127.0.0.1',
      {
        pluginId: 'latex-submission-check',
        version: '1.0.0',
        enabled: false,
        status: 'disabled',
        skillCount: 1,
        sourceType: 'zip_url',
        integrity: 'abc123',
      }
    )
    expect(jsonBody(ctx.res).plugin.enabled).to.equal(false)
  })

  it('returns validation errors from plugin package preview', async function (ctx) {
    ctx.PluginInstallationManager.previewAgentPluginPackage.rejects(
      new ctx.PluginPackageManager.AgentPluginPackageValidationError(
        'Plugin package contains executable capability path: scripts/run.sh'
      )
    )
    ctx.req.body = {
      sourceType: 'local_directory',
      path: '/srv/plugins/unsafe',
    }

    await ctx.Controller.previewGlobalPlugin(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Plugin package contains executable capability path: scripts/run.sh',
      },
    })
  })
})
