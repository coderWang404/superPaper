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
    ctx.SessionManager = {
      getLoggedInUserId: sinon.stub().returns('user-one'),
    }
    ctx.ProjectAuditLogHandler = {
      addEntryInBackground: sinon.stub(),
    }

    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentSettingsManager',
      () => ctx.SettingsManager
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
})
