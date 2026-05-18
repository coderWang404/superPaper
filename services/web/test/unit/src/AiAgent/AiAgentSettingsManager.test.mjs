import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentSettingsManager.mjs'

async function expectRejectsWithValidationError(promise, message) {
  let error
  try {
    await promise
  } catch (err) {
    error = err
  }
  expect(error).to.exist
  expect(error.name).to.equal('AgentSettingsValidationError')
  expect(error.message).to.equal(message)
}

describe('AiAgentSettingsManager', function () {
  beforeEach(async function (ctx) {
    ctx.skillSettings = [
      {
        scope: 'global',
        projectId: null,
        skillId: 'latex-compile-debug',
        enabled: false,
      },
      {
        scope: 'project',
        projectId: 'project-one',
        skillId: 'custom-style-guide',
        enabled: true,
        displayName: 'Custom style guide',
        description: 'Project writing conventions',
        modelInvocable: true,
        requiredTools: ['project.read_file'],
        keywords: ['style'],
        content: 'Follow the project style guide.',
      },
    ]
    ctx.pluginSettings = [
      {
        scope: 'project',
        projectId: 'project-one',
        pluginId: 'latex-core',
        enabled: false,
      },
    ]
    ctx.instructionProfiles = [
      {
        _id: 'instruction-one',
        scope: 'global',
        projectId: null,
        name: 'Global Agent Rules',
        content: 'Never expose secrets.',
        enabled: true,
        createdAt: null,
        updatedAt: null,
      },
    ]

    ctx.AgentSkillSetting = {
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          exec: sinon.stub().resolves(ctx.skillSettings),
        }),
      }),
      updateOne: sinon.stub().returns({
        exec: sinon.stub().resolves({ acknowledged: true }),
      }),
    }
    ctx.AgentPluginSetting = {
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          exec: sinon.stub().resolves(ctx.pluginSettings),
        }),
      }),
      updateOne: sinon.stub().returns({
        exec: sinon.stub().resolves({ acknowledged: true }),
      }),
    }
    ctx.AgentInstructionProfile = {
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          exec: sinon.stub().resolves(ctx.instructionProfiles),
        }),
      }),
      updateOne: sinon.stub().returns({
        exec: sinon.stub().resolves({ acknowledged: true }),
      }),
    }

    vi.doMock('../../../../app/src/models/AgentSkillSetting', () => ({
      AgentSkillSetting: ctx.AgentSkillSetting,
    }))
    vi.doMock('../../../../app/src/models/AgentPluginSetting', () => ({
      AgentPluginSetting: ctx.AgentPluginSetting,
    }))
    vi.doMock('../../../../app/src/models/AgentInstructionProfile', () => ({
      AgentInstructionProfile: ctx.AgentInstructionProfile,
    }))

    ctx.Manager = await import(modulePath)
  })

  it('returns effective config with enabled skills, plugins, and instruction profiles', async function (ctx) {
    const config = await ctx.Manager.getAgentConfig({ projectId: 'project-one' })

    expect(config.permissionProfile.id).to.equal('project-agent-default')
    expect(config.enabledSkillIds).to.include('custom-style-guide')
    expect(config.enabledPluginIds).to.not.include('latex-core')
    expect(config.enabledSkillIds).to.not.include('latex-compile-debug')
    expect(config.instructionProfiles).to.deep.equal([
      {
        id: 'instruction-one',
        scope: 'global',
        projectId: null,
        name: 'Global Agent Rules',
        enabled: true,
        createdAt: null,
        updatedAt: null,
      },
    ])
    expect(ctx.AgentSkillSetting.find).to.have.been.calledWith({
      scope: 'project',
      projectId: 'project-one',
    })
    expect(ctx.AgentPluginSetting.find).to.have.been.calledWith({
      scope: 'project',
      projectId: 'project-one',
    })
    expect(ctx.AgentInstructionProfile.find).to.have.been.calledWith({
      scope: 'project',
      projectId: 'project-one',
      enabled: true,
    })
  })

  it('returns editable content for global agent administration', async function (ctx) {
    const config = await ctx.Manager.getAgentConfig({
      includeContent: true,
      includeAllInstructionProfiles: true,
    })

    const skill = config.skills.find(
      currentSkill => currentSkill.id === 'custom-style-guide'
    )
    expect(skill.content).to.equal('Follow the project style guide.')
    expect(skill.keywords).to.deep.equal(['style'])
    expect(config.instructionProfiles[0]).to.include({
      name: 'Global Agent Rules',
      content: 'Never expose secrets.',
      bytes: 21,
    })
    expect(config.instructionProfiles[0].sha256).to.match(/^[a-f0-9]{64}$/)
    expect(ctx.AgentInstructionProfile.find).to.have.been.calledWith({
      scope: 'global',
    })
  })

  it('selects only enabled skills for model context', async function (ctx) {
    const selectedSkills = await ctx.Manager.getSelectedSkillsForTask('fix compile style', {
      projectId: 'project-one',
    })

    expect(selectedSkills.map(skill => skill.id)).to.include(
      'custom-style-guide'
    )
    expect(selectedSkills.map(skill => skill.id)).to.not.include(
      'latex-compile-debug'
    )
    expect(
      selectedSkills.find(skill => skill.id === 'custom-style-guide').content
    ).to.equal('Follow the project style guide.')
  })

  it('persists project settings with upserted skill, plugin, and instruction rows', async function (ctx) {
    await ctx.Manager.updateAgentSettings({
      scope: 'project',
      projectId: 'project-one',
      userId: 'user-one',
      skills: [
        {
          id: 'academic-polish',
          enabled: true,
          requiredTools: ['project.read_file'],
        },
      ],
      plugins: [
        {
          id: 'latex-core',
          enabled: true,
          manifest: { name: 'latex-core' },
        },
      ],
      instructionProfiles: [
        {
          name: 'Project Agent Rules',
          content: 'Use short plans.',
          enabled: true,
        },
      ],
    })

    expect(ctx.AgentSkillSetting.updateOne).to.have.been.calledWith(
      { scope: 'project', projectId: 'project-one', skillId: 'academic-polish' },
      sinon.match({
        $set: sinon.match({
          enabled: true,
          updatedBy: 'user-one',
          requiredTools: ['project.read_file'],
        }),
      }),
      { upsert: true }
    )
    expect(ctx.AgentPluginSetting.updateOne).to.have.been.calledWith(
      { scope: 'project', projectId: 'project-one', pluginId: 'latex-core' },
      sinon.match({
        $set: sinon.match({
          enabled: true,
          updatedBy: 'user-one',
          manifest: { name: 'latex-core' },
        }),
      }),
      { upsert: true }
    )
    expect(ctx.AgentInstructionProfile.updateOne).to.have.been.calledWith(
      { scope: 'project', projectId: 'project-one', name: 'Project Agent Rules' },
      sinon.match({
        $set: sinon.match({
          content: 'Use short plans.',
          enabled: true,
          updatedBy: 'user-one',
        }),
      }),
      { upsert: true }
    )
  })

  it('rejects skills that require unknown tools', async function (ctx) {
    await expectRejectsWithValidationError(
      ctx.Manager.updateAgentSettings({
        scope: 'project',
        projectId: 'project-one',
        userId: 'user-one',
        skills: [
          {
            id: 'unsafe-skill',
            enabled: true,
            requiredTools: ['shell.run'],
          },
        ],
      }),
      'Unknown agent tool: shell.run'
    )
  })

  it('rejects plugin manifests that declare executable capabilities', async function (ctx) {
    await expectRejectsWithValidationError(
      ctx.Manager.updateAgentSettings({
        scope: 'global',
        userId: 'user-one',
        plugins: [
          {
            id: 'unsafe-plugin',
            enabled: true,
            manifest: {
              contributes: {
                hooks: [{ command: 'npm test' }],
              },
            },
          },
        ],
      }),
      'Agent plugin manifest contains executable capability: contributes.hooks'
    )
  })

  it('rejects plugin executable capability aliases case-insensitively', async function (ctx) {
    await expectRejectsWithValidationError(
      ctx.Manager.updateAgentSettings({
        scope: 'global',
        userId: 'user-one',
        plugins: [
          {
            id: 'unsafe-plugin',
            enabled: true,
            manifest: {
              contributes: {
                mcp_server: {
                  Shell: 'npm test',
                },
              },
            },
          },
        ],
      }),
      'Agent plugin manifest contains executable capability: contributes.mcp_server'
    )
  })
})
