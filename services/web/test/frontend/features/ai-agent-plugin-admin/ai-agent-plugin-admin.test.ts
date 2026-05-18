import { expect } from 'chai'
import { fireEvent, screen } from '@testing-library/dom'
import fetchMock from 'fetch-mock'

import { resetMeta } from '../../helpers/reset-meta'
import { initAiAgentPluginAdmin } from '../../../../frontend/js/features/ai-agent-plugin-admin/ai-agent-plugin-admin'

describe('ai-agent-plugin-admin', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    document.body.innerHTML = ''
    resetMeta()
  })

  it('loads installed plugins from the admin endpoint', async function () {
    fetchMock.get('/admin/ai/agent/plugins', {
      plugins: [pluginFixture()],
    })

    initAiAgentPluginAdmin(renderRoot())

    await screen.findByText('LaTeX 投稿检查')
    screen.getByText('latex-submission-check')
    expect(screen.getAllByText('Enabled')).to.have.length(2)
    screen.getByText('abc123def456')
  })

  it('previews a local directory plugin without rendering skill content', async function () {
    fetchMock.get('/admin/ai/agent/plugins', { plugins: [] })
    fetchMock.post('/admin/ai/agent/plugins/preview', {
      preview: previewFixture(),
    })

    initAiAgentPluginAdmin(renderRoot())

    await screen.findByText('No Agent plugins installed')
    fireEvent.input(screen.getByLabelText('Plugin directory path'), {
      target: { value: '/srv/plugins/submission' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Preview Agent plugin' }))

    await screen.findByText('Plugin preview ready')
    screen.getByText('compile-debug')
    screen.getByText('project.read_file · 16 B')
    expect(document.body.textContent).not.to.contain('Read logs first.')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/agent/plugins/preview'
    )[0]
    expect(call.options.headers).to.include({
      'x-csrf-token': 'csrf-token',
    })
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      sourceType: 'local_directory',
      path: '/srv/plugins/submission',
    })
  })

  it('installs a previewed plugin and clears the preview panel', async function () {
    fetchMock.get('/admin/ai/agent/plugins', { plugins: [] })
    fetchMock.post('/admin/ai/agent/plugins/preview', {
      preview: previewFixture(),
    })
    fetchMock.post('/admin/ai/agent/plugins/install', {
      plugin: pluginFixture(),
      config: {},
    })

    initAiAgentPluginAdmin(renderRoot())

    await screen.findByText('No Agent plugins installed')
    fireEvent.input(screen.getByLabelText('Plugin directory path'), {
      target: { value: '/srv/plugins/submission' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Preview Agent plugin' }))
    await screen.findByText('Plugin preview ready')
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin' }))

    await screen.findByText('Plugin installed')
    screen.getByText('LaTeX 投稿检查')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/agent/plugins/install'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      sourceType: 'local_directory',
      path: '/srv/plugins/submission',
      enabled: true,
    })
  })

  it('toggles an installed plugin', async function () {
    fetchMock.get('/admin/ai/agent/plugins', {
      plugins: [pluginFixture({ enabled: true })],
    })
    fetchMock.patch('/admin/ai/agent/plugins/latex-submission-check', {
      plugin: pluginFixture({ enabled: false, status: 'disabled' }),
      config: {},
    })

    initAiAgentPluginAdmin(renderRoot())

    await screen.findByText('LaTeX 投稿检查')
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    expect(screen.getByRole('button', { name: 'Disable' })).to.have.property(
      'disabled',
      true
    )

    await screen.findByText('Plugin disabled')
    screen.getByText('Disabled')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/agent/plugins/latex-submission-check'
    )[0]
    expect(call.options.method).to.equal('patch')
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      enabled: false,
    })
  })

  it('shows a safe error message when the API fails', async function () {
    fetchMock.get('/admin/ai/agent/plugins', 500)

    initAiAgentPluginAdmin(renderRoot())

    await screen.findByRole('alert')
    screen.getByText('Agent plugin request failed')
  })

  it('uses the system language for plugin administration copy', async function () {
    window.metaAttributesCache.set('ol-i18n', { currentLangCode: 'zh-CN' })
    fetchMock.get('/admin/ai/agent/plugins', { plugins: [] })

    initAiAgentPluginAdmin(renderRoot())

    await screen.findByText('尚未安装 Agent 插件')
    screen.getByRole('heading', { name: 'Agent 插件' })
    screen.getByRole('form', { name: '预览 Agent 插件' })
    screen.getByLabelText('插件目录路径')
  })
})

function renderRoot() {
  const root = document.createElement('div')
  root.id = 'ai-agent-plugin-admin'
  root.dataset.csrfToken = 'csrf-token'
  document.body.append(root)
  return root
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
      type: 'local_directory',
      pathHash: 'path-hash',
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
      type: 'local_directory',
      pathHash: 'path-hash',
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
