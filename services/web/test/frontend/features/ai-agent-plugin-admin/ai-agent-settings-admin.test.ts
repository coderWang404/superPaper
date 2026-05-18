import { expect } from 'chai'
import { fireEvent, screen } from '@testing-library/dom'
import fetchMock from 'fetch-mock'

import { resetMeta } from '../../helpers/reset-meta'
import { initAiAgentSettingsAdmin } from '../../../../frontend/js/features/ai-agent-plugin-admin/ai-agent-settings-admin'

describe('ai-agent-settings-admin', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    document.body.innerHTML = ''
    resetMeta()
  })

  it('loads editable global instructions and skills', async function () {
    fetchMock.get('/admin/ai/agent/config', configFixture())

    initAiAgentSettingsAdmin(renderRoot())

    await screen.findByText('Global Agent rules')
    screen.getByDisplayValue('Do not reveal secrets.')
    screen.getByText('Custom project skill')
    screen.getByText('custom-style-guide')
  })

  it('saves global AGENTS-style instructions through the settings endpoint', async function () {
    fetchMock.get('/admin/ai/agent/config', configFixture())
    fetchMock.patch('/admin/ai/agent/settings', configFixture({
      instructionProfiles: [
        {
          ...instructionFixture(),
          content: 'Keep edits reviewed.',
        },
      ],
    }))

    initAiAgentSettingsAdmin(renderRoot())

    await screen.findByText('Global Agent rules')
    fireEvent.input(screen.getByLabelText('Instructions'), {
      target: { value: 'Keep edits reviewed.' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Global Agent rules' }))

    await screen.findByText('Global Agent rules saved')
    const call = fetchMock.callHistory.calls('/admin/ai/agent/settings')[0]
    expect(call.options.method).to.equal('patch')
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      instructionProfiles: [
        {
          id: 'Global Agent Rules',
          scope: 'global',
          projectId: null,
          name: 'Global Agent Rules',
          content: 'Keep edits reviewed.',
          enabled: true,
          createdAt: null,
          updatedAt: null,
        },
      ],
    })
  })

  it('adds a custom skill with selected tools', async function () {
    fetchMock.get('/admin/ai/agent/config', configFixture({ skills: [] }))
    fetchMock.patch('/admin/ai/agent/settings', configFixture({
      skills: [
        {
          ...skillFixture(),
          id: 'latex-style',
          name: 'latex-style',
          displayName: 'LaTeX style',
          description: 'Use local macros.',
          content: 'Respect local macros.',
          requiredTools: ['project.read_file'],
        },
      ],
    }))

    initAiAgentSettingsAdmin(renderRoot())

    await screen.findByText('No Agent skills configured')
    fireEvent.input(screen.getByLabelText('Skill ID'), {
      target: { value: 'latex-style' },
    })
    fireEvent.input(screen.getByLabelText('Display name'), {
      target: { value: 'LaTeX style' },
    })
    fireEvent.input(screen.getByLabelText('Description'), {
      target: { value: 'Use local macros.' },
    })
    const toolsSelect = screen.getByLabelText('Required tools') as HTMLSelectElement
    toolsSelect.options[0].selected = true
    fireEvent.change(toolsSelect)
    fireEvent.input(screen.getByLabelText('Content'), {
      target: { value: 'Respect local macros.' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Add custom skill' }))

    await screen.findByText('Skill saved')
    const call = fetchMock.callHistory.calls('/admin/ai/agent/settings')[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      skills: [
        {
          id: 'latex-style',
          name: 'latex-style',
          displayName: 'LaTeX style',
          description: 'Use local macros.',
          keywords: [],
          requiredTools: ['project.read_file'],
          content: 'Respect local macros.',
          enabled: true,
          modelInvocable: true,
          scope: 'global',
          pluginId: null,
        },
      ],
    })
  })

  it('uses the system language for settings administration copy', async function () {
    window.metaAttributesCache.set('ol-i18n', { currentLangCode: 'zh-CN' })
    fetchMock.get('/admin/ai/agent/config', configFixture())

    initAiAgentSettingsAdmin(renderRoot())

    await screen.findByText('全局 Agent 约束')
    screen.getByText('Agent Skill')
    screen.getByLabelText('约束内容')
    screen.getByLabelText('Skill ID')
  })
})

function renderRoot() {
  const root = document.createElement('div')
  root.id = 'ai-agent-settings-admin'
  root.dataset.csrfToken = 'csrf-token'
  document.body.append(root)
  return root
}

function configFixture(overrides = {}) {
  return {
    permissionProfile: {
      id: 'project-agent-default',
      writeToolsRequireApproval: true,
      externalToolsEnabled: false,
      actRequiredForWriteTools: true,
    },
    tools: [
      {
        name: 'project.read_file',
        description: 'Read file',
        access: 'read',
        requiresApproval: false,
        category: 'project',
        riskLevel: 'low',
      },
    ],
    skills: [skillFixture()],
    plugins: [],
    enabledSkillIds: ['custom-style-guide'],
    enabledPluginIds: [],
    instructionProfiles: [instructionFixture()],
    ...overrides,
  }
}

function skillFixture(overrides = {}) {
  return {
    id: 'custom-style-guide',
    name: 'custom-style-guide',
    displayName: 'Custom project skill',
    description: 'Project writing conventions',
    modelInvocable: true,
    requiredTools: ['project.read_file'],
    keywords: ['style'],
    content: 'Follow local style.',
    enabled: true,
    scope: 'global',
    pluginId: null,
    ...overrides,
  }
}

function instructionFixture(overrides = {}) {
  return {
    id: 'instruction-one',
    scope: 'global',
    projectId: null,
    name: 'Global Agent Rules',
    enabled: true,
    content: 'Do not reveal secrets.',
    bytes: 22,
    sha256: 'abc123',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}
