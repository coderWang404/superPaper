import { expect } from 'chai'
import {
  fireEvent,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import fetchMock from 'fetch-mock'

import AgentSettingsPanel from '../../../../../frontend/js/features/ai-agent-settings/components/agent-settings-panel'
import { renderWithEditorContext } from '../../../helpers/render-with-context'

describe('<AgentSettingsPanel />', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-csrfToken', 'csrf-token')
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    document.body.innerHTML = ''
  })

  it('loads project-scoped rules, skills, and plugins', async function () {
    mockConfig()
    mockPlugins()

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    screen.getByText('Project Agent Workbench')
    screen.getByRole('tab', { name: /Skills 2/ })
    screen.getByRole('tab', { name: /Plugins/ })
    screen.getByRole('tab', { name: 'Rules' })
    screen.getByText('Project skill')
    screen.getByRole('button', { name: 'Choose file' })
    screen.getByLabelText('LaTeX 编译错误诊断 Enabled')
    expect(screen.queryByText('Global Agent Rules')).to.equal(null)
    expect(screen.queryByLabelText('Skill ID')).to.equal(null)
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }))
    screen.getByDisplayValue('Project Agent Rules')
    screen.getByDisplayValue('Use project-specific constraints.')
    fireEvent.click(screen.getByRole('tab', { name: /Plugins/ }))
    screen.getByText('LaTeX 投稿检查')
  })

  it('saves project rules through the project settings endpoint', async function () {
    mockConfig()
    mockPlugins()
    fetchMock.patch(
      '/project/project123/ai/agent/settings?includeContent=true',
      configFixture({
        instructionProfiles: [
          {
            id: 'rules',
            scope: 'project',
            projectId: 'project123',
            name: 'Project Agent Rules',
            content: 'Updated rules.',
            enabled: true,
            createdAt: null,
            updatedAt: null,
          },
        ],
      })
    )

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }))
    fireEvent.change(screen.getByLabelText('Rules content'), {
      target: { value: 'Updated rules.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }))

    await screen.findByText('Project Agent rules saved')
    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/settings?includeContent=true'
    )[0]
    expect(call.options.headers).to.include({
      'x-csrf-token': 'csrf-token',
    })
    expect(JSON.parse(call.options.body as string).instructionProfiles).to.deep
      .include({
        id: 'Project Agent Rules',
        scope: 'project',
        projectId: 'project123',
        name: 'Project Agent Rules',
        content: 'Updated rules.',
        enabled: true,
        createdAt: null,
        updatedAt: null,
      })
  })

  it('detects GitHub links and previews project plugins', async function () {
    mockConfig()
    mockPlugins()
    fetchMock.post('/project/project123/ai/agent/plugins/preview', {
      preview: previewFixture(),
    })

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    fireEvent.click(screen.getByRole('tab', { name: /Plugins/ }))
    fireEvent.change(screen.getByLabelText('GitHub URL'), {
      target: { value: 'https://github.com/example/agent-plugin/tree/dev' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Plugin source form' }))

    await screen.findByText('Plugin preview ready')
    screen.getByText('compile-debug')
    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/plugins/preview'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      sourceType: 'github',
      url: 'https://github.com/example/agent-plugin/tree/dev',
      ref: 'dev',
    })
  })

  it('drops a SKILL.md file into the skill form', async function () {
    mockConfig()
    mockPlugins()

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    const skillContent = '# Literature Review\n\nReview related work.'
    const file = new File([skillContent], 'SKILL.md', {
      type: 'text/markdown',
    })
    Object.defineProperty(file, 'text', {
      value: async () => skillContent,
    })
    fireEvent.drop(screen.getByText('Drop SKILL.md or plugin zip here'), {
      dataTransfer: {
        files: [file],
        getData: () => '',
      },
    })

    await screen.findByText('Skill file recognized')
    screen.getByDisplayValue('Literature Review')
    expect(screen.getByLabelText('SKILL.md')).to.have.property(
      'value',
      skillContent
    )
  })

  it('chooses a SKILL.md file from the explicit file picker', async function () {
    mockConfig()
    mockPlugins()

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    const skillContent = '# Literature Review\n\nReview related work.'
    const file = new File([skillContent], 'SKILL.md', {
      type: 'text/markdown',
    })
    Object.defineProperty(file, 'text', {
      value: async () => skillContent,
    })
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [file] },
    })

    await screen.findByText('Skill file recognized')
    screen.getByDisplayValue('Literature Review')
    expect(screen.getByLabelText('SKILL.md')).to.have.property(
      'value',
      skillContent
    )
  })

  it('imports a SKILL.md file from a GitHub URL', async function () {
    mockConfig()
    mockPlugins()
    fetchMock.post('/project/project123/ai/agent/skills/import-preview', {
      preview: {
        source: {
          type: 'github_file',
          url: 'https://github.com/example/skills/blob/main/SKILL.md',
          rawUrl:
            'https://raw.githubusercontent.com/example/skills/main/SKILL.md',
          path: 'SKILL.md',
        },
        content: `---
name: literature-review
description: Review related work.
---

# Literature Review
`,
        metadata: {
          name: 'literature-review',
          description: 'Review related work.',
        },
        bytes: 82,
        sha256: 'abc123',
      },
    })

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    fireEvent.change(screen.getByLabelText('SKILL.md URL'), {
      target: {
        value: 'https://github.com/example/skills/blob/main/SKILL.md',
      },
    })
    fireEvent.submit(
      screen.getByRole('form', { name: 'Import skill from URL' })
    )

    await screen.findByText('SKILL.md imported from URL')
    screen.getByText('Review related work.')
    expect(screen.getByLabelText('SKILL.md')).to.have.property(
      'value'
    ).that.contains('name: literature-review')
    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/skills/import-preview'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      sourceType: 'github_file',
      url: 'https://github.com/example/skills/blob/main/SKILL.md',
    })
  })

  it('reads SKILL.md frontmatter without exposing internal fields by default', async function () {
    mockConfig()
    mockPlugins()

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    const skillContent = `---
name: citation-auditor
description: Check citation coverage before submission.
---

# Citation Auditor

Review citation coverage.`
    const file = new File([skillContent], 'SKILL.md', {
      type: 'text/markdown',
    })
    Object.defineProperty(file, 'text', {
      value: async () => skillContent,
    })
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [file] },
    })

    await screen.findByText('Skill file recognized')
    screen.getByDisplayValue('Citation Auditor')
    screen.getByText('Check citation coverage before submission.')
    screen.getByText('Parsed metadata')
    fireEvent.click(screen.getByText('Parsed metadata'))
    screen.getByDisplayValue('citation-auditor')
  })

  it('uploads dropped plugin zips and installs the preview', async function () {
    mockConfig()
    mockPlugins()
    fetchMock.post('/project/project123/ai/agent/plugins/upload', {
      uploadId: '11111111-1111-4111-8111-111111111111',
      originalName: 'agent-plugin.zip',
      preview: previewFixture(),
    })
    fetchMock.post('/project/project123/ai/agent/plugins/install', {
      plugin: pluginFixture(),
      config: configFixture(),
    })

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'owner',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    const file = new File(['zip'], 'agent-plugin.zip', {
      type: 'application/zip',
    })
    fireEvent.click(screen.getByRole('tab', { name: /Plugins/ }))
    fireEvent.drop(screen.getByText('Drop SKILL.md or plugin zip here'), {
      dataTransfer: {
        files: [file],
        getData: () => '',
      },
    })

    await screen.findByText('Plugin zip uploaded and previewed')
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin' }))

    await screen.findByText('Plugin installed')
    const uploadCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/plugins/upload'
    )[0]
    expect(uploadCall.options.body).to.be.instanceOf(FormData)
    const installCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/plugins/install'
    )[0]
    expect(JSON.parse(installCall.options.body as string)).to.deep.equal({
      sourceType: 'uploaded_zip',
      uploadId: '11111111-1111-4111-8111-111111111111',
      originalName: 'agent-plugin.zip',
      enabled: true,
    })
  })

  it('disables editing for non-project admins', async function () {
    mockConfig()
    mockPlugins()

    renderWithEditorContext(<AgentSettingsPanel />, {
      permissionsLevel: 'readAndWrite',
      mockCompileOnLoad: true,
    })

    await waitForElementToBeRemoved(() =>
      screen.getByText('Loading Agent settings…')
    )
    screen.getByText(
      "You can view this project's Agent settings, but only project owners can change rules, skills, and plugins."
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }))
    expect(screen.getByRole('button', { name: 'Save rules' })).to.have.property(
      'disabled',
      true
    )
  })
})

function mockConfig(overrides = {}) {
  fetchMock.get(
    '/project/project123/ai/agent/config?includeContent=true',
    configFixture(overrides)
  )
}

function mockPlugins() {
  fetchMock.get('/project/project123/ai/agent/plugins', {
    plugins: [pluginFixture()],
  })
}

function configFixture(overrides = {}) {
  return {
    permissionProfile: {
      id: 'project-agent-default',
      writeToolsRequireApproval: true,
      externalToolsEnabled: false,
    },
    tools: [
      {
        name: 'project.read_file',
        description: 'Read file',
        access: 'read',
        requiresApproval: false,
      },
      {
        name: 'project.search',
        description: 'Search',
        access: 'read',
        requiresApproval: false,
      },
    ],
    toolPolicies: [],
    skills: [
      {
        id: 'latex-compile-debug',
        name: 'latex-compile-debug',
        displayName: 'LaTeX 编译错误诊断',
        description: 'Diagnose compile errors.',
        modelInvocable: true,
        requiredTools: ['project.read_file'],
        enabled: true,
        scope: 'builtin',
        pluginId: 'latex-core',
      },
      {
        id: 'project-skill',
        name: 'project-skill',
        displayName: 'Project skill',
        description: 'Project-specific skill.',
        modelInvocable: true,
        requiredTools: ['project.search'],
        keywords: ['project'],
        content: 'Use project data.',
        enabled: true,
        scope: 'project',
        pluginId: null,
      },
    ],
    plugins: [
      {
        id: 'latex-core',
        name: 'latex-core',
        version: '1.0.0',
        displayName: 'LaTeX 核心 Agent 能力包',
        description: 'Built in.',
        enabled: true,
        skills: ['latex-compile-debug'],
        toolPresets: [],
        scope: 'builtin',
      },
    ],
    enabledSkillIds: ['latex-compile-debug', 'project-skill'],
    enabledPluginIds: ['latex-core'],
    instructionProfiles: [
      {
        id: 'rules',
        scope: 'project',
        projectId: 'project123',
        name: 'Project Agent Rules',
        content: 'Use project-specific constraints.',
        enabled: true,
        createdAt: null,
        updatedAt: null,
      },
    ],
    ...overrides,
  }
}

function pluginFixture(overrides = {}) {
  return {
    pluginId: 'latex-submission-check',
    name: 'latex-submission-check',
    version: '1.0.0',
    displayName: 'LaTeX 投稿检查',
    description: 'Submission checks.',
    enabled: true,
    status: 'installed',
    manifestFormat: 'superpaper',
    source: {
      type: 'github',
      url: 'https://github.com/example/agent-plugin',
    },
    integrity: {
      sha256: 'abc123def4567890',
    },
    packageBytes: 1024,
    fileCount: 2,
    skillIds: ['latex-submission-check/compile-debug'],
    warnings: [],
    ...overrides,
  }
}

function previewFixture() {
  return {
    plugin: {
      id: 'latex-submission-check',
      name: 'latex-submission-check',
      version: '1.0.0',
      displayName: 'LaTeX 投稿检查',
      description: 'Submission checks.',
      manifestFormat: 'superpaper',
    },
    source: {
      type: 'github',
      url: 'https://github.com/example/agent-plugin',
    },
    skills: [
      {
        id: 'latex-submission-check/compile-debug',
        displayName: 'compile-debug',
        description: 'Diagnose compile errors.',
        requiredTools: ['project.read_file'],
        contentBytes: 16,
        sourcePath: 'skills/compile-debug/SKILL.md',
      },
    ],
    integrity: {
      sha256: 'abc123def4567890',
    },
    packageBytes: 1024,
    fileCount: 2,
    warnings: [],
  }
}
