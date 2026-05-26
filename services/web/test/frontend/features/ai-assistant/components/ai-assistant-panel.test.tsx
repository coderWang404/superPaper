import { expect } from 'chai'
import {
  fireEvent,
  within,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import fetchMock from 'fetch-mock'
import sinon from 'sinon'
import { type FC, type PropsWithChildren, useMemo, useState } from 'react'
import { EditorSelection } from '@codemirror/state'

import AiAssistantPanel from '../../../../../frontend/js/features/ai-assistant/components/ai-assistant-panel'
import { renderWithEditorContext } from '../../../helpers/render-with-context'
import {
  EditorSelectionContext,
  type useEditorSelectionContext,
} from '../../../../../frontend/js/shared/context/editor-selection-context'
import { EditorViewContext } from '../../../../../frontend/js/features/ide-react/context/editor-view-context'
import customLocalStorage from '../../../../../frontend/js/infrastructure/local-storage'
import zhCnTranslations from '../../../../../locales/zh-CN.json'

describe('<AiAssistantPanel />', function () {
  let originalClipboard: Clipboard | undefined

  beforeEach(function () {
    customLocalStorage.clear()
    originalClipboard = navigator.clipboard
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
    window.metaAttributesCache.set('ol-ExposedSettings', {
      ...window.metaAttributesCache.get('ol-ExposedSettings'),
      validRootDocExtensions: ['tex'],
    })
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    customLocalStorage.clear()
    ;(navigator as any).clipboard = originalClipboard
    sinon.restore()
  })

  it('shows the configured default model after loading config', async function () {
    mockConfig()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    screen.getByText('Provider One')
    screen.getByText('Model One')
    screen.getByText('Using project context')
    screen.getByText('Start from this project')
    screen.getByLabelText('Provider')
    expect(
      screen.queryByRole('button', { name: /Agent Settings|Agent 设置/ })
    ).to.equal(null)
    screen.getByRole('button', {
      name: 'Diagnose the latest compile error',
    })
    screen.getByRole('button', { name: 'Chat' })
    screen.getByRole('button', { name: 'Agent' })
    screen.getByLabelText('Model')
  })

  it('keeps zh-CN Agent runtime summary copy localized', function () {
    expect(zhCnTranslations.ai_assistant_plugins_summary).to.equal(
      '插件：__plugins__'
    )
    expect(zhCnTranslations.ai_assistant_skills_summary).to.equal(
      '技能：__skills__'
    )
    expect(zhCnTranslations.ai_assistant_subagents_summary).to.equal(
      '子 Agent：__state__'
    )
  })

  it('fills the composer from a suggested prompt', async function () {
    mockConfig()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Diagnose the latest compile error' })
    )

    expect(screen.getByLabelText('Ask about this project')).to.have.property(
      'value',
      'Diagnose the latest compile error'
    )
  })

  it('shows an empty provider state when no provider is configured', async function () {
    fetchMock.get('/project/project123/ai/config', { providers: [] })

    renderWithEditorContext(<AiAssistantPanel />)

    await screen.findByText('No AI provider configured')
    screen.getByText(
      'A site admin needs to add an AI provider before project questions can be answered.'
    )
  })

  it('sends prompt and current selection to the project chat endpoint', async function () {
    mockConfig()
    mockChatStream()

    renderWithEditorContext(<AiAssistantPanel />, {
      scope: {
        editor: {
          sharejs_doc: {
            doc_id: 'doc-one',
            getSnapshot: () => 'Hello selected text.',
            hasBufferedOps: () => false,
            on: () => {},
            off: () => {},
            leaveAndCleanUpPromise: async () => {},
          },
          currentDocumentId: 'doc-one',
          openDocName: 'main.tex',
        },
      },
      providers: {
        EditorSelectionProvider: makeEditorSelectionProvider(
          EditorSelection.single(6, 19)
        ),
        EditorViewProvider: makeEditorViewProvider('Hello selected text.'),
      },
    })

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    screen.getByText('Using current selection')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'How should I cite this?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText(/Use \\cite\{\} here\./)

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/chat/stream'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      prompt: 'How should I cite this?',
      providerId: 'provider-one',
      model: 'model-one',
      selection: {
        docId: 'doc-one',
        path: 'main.tex',
        text: 'selected text',
      },
      history: [],
    })
  })

  it('clears the composer after a successful chat response', async function () {
    mockConfig()
    mockChatStream()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Explain the current draft.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText(/Use \\cite\{\} here\./)
    expect(screen.getByLabelText('Ask about this project')).to.have.property(
      'value',
      ''
    )
  })

  it('persists chat history after remounting the panel', async function () {
    mockConfig()
    mockChatStream()

    const { unmount } = renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Remember this answer.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/Use \\cite\{\} here\./)

    unmount()
    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    const transcript = document.querySelector('.ai-assistant-transcript')
    expect(transcript).not.to.equal(null)
    within(transcript as HTMLElement).getByText('Remember this answer.')
    within(transcript as HTMLElement).getByText(/Use \\cite\{\} here\./)
  })

  it('keeps selectable chat conversations across new chats', async function () {
    mockConfig()
    mockChatStream({ repeat: 2 })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'First thread question.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/Use \\cite\{\} here\./)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    const transcript = document.querySelector('.ai-assistant-transcript')
    expect(transcript).not.to.equal(null)
    expect(
      within(transcript as HTMLElement).queryByText('First thread question.')
    ).to.equal(null)
    screen.getByText('Start from this project')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Second thread question.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findAllByText(/Use \\cite\{\} here\./)

    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: 'chat-1' },
    })

    within(transcript as HTMLElement).getByText('First thread question.')
    expect(
      within(transcript as HTMLElement).queryByText('Second thread question.')
    ).to.equal(null)
  })

  it('keeps chat context when switching providers', async function () {
    mockConfigWithTwoProviders()
    mockChatStream({ repeat: 2 })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'First question.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/Use \\cite\{\} here\./)

    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'provider-two' },
    })
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Continue with another provider.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findAllByText(/Use \\cite\{\} here\./)
    const secondCall = fetchMock.callHistory.calls(
      '/project/project123/ai/chat/stream'
    )[1]
    expect(JSON.parse(secondCall.options.body as string)).to.deep.equal({
      prompt: 'Continue with another provider.',
      providerId: 'provider-two',
      model: 'model-two',
      history: [
        { role: 'user', content: 'First question.' },
        { role: 'assistant', content: 'Use \\\\cite{} here.' },
      ],
    })
  })

  it('renders included context files returned by the backend', async function () {
    mockConfig()
    mockChatStream({
      context: {
        includedFiles: ['main.tex', 'refs.bib'],
        selectionIncluded: false,
        truncated: false,
      },
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Summarize the bibliography.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Context used')
    const answer = screen.getByText(/Use \\cite\{\} here\./)
    const assistantMessage = answer.closest('.ai-assistant-message-assistant')
    expect(assistantMessage).not.to.equal(null)
    expect(assistantMessage?.textContent).to.contain('Context used')
    expect(assistantMessage?.textContent).to.contain('main.tex')
    expect(assistantMessage?.textContent).to.contain('refs.bib')
  })

  it('clears chat history when requested', async function () {
    mockConfig()
    mockChatStream()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Clear this thread.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/Use \\cite\{\} here\./)

    fireEvent.click(screen.getByRole('button', { name: 'Clear chat' }))

    expect(screen.queryByText('Clear this thread.')).to.equal(null)
    expect(screen.queryByText(/Use \\cite\{\} here\./)).to.equal(null)
    screen.getByText('Start from this project')
  })

  it('copies an assistant response to the clipboard', async function () {
    const writeText = sinon.stub().resolves()
    ;(navigator as any).clipboard = { writeText }
    mockConfig()
    mockChatStream()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Give me copyable text.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/Use \\cite\{\} here\./)

    fireEvent.click(screen.getByRole('button', { name: 'Copy response' }))

    expect(writeText).to.have.been.calledOnceWith('Use \\\\cite{} here.')
  })

  it('inserts the first LaTeX code block from an assistant response into the editor', async function () {
    const dispatch = sinon.stub()
    const focus = sinon.stub()
    mockConfig()
    mockChatStream({
      deltas: ['```latex\n\\section{Intro}\n```'],
    })

    renderWithEditorContext(<AiAssistantPanel />, {
      scope: {
        editor: {
          sharejs_doc: {
            doc_id: 'doc-one',
            getSnapshot: () => 'Old title',
            hasBufferedOps: () => false,
            on: () => {},
            off: () => {},
            leaveAndCleanUpPromise: async () => {},
          },
          currentDocumentId: 'doc-one',
          openDocName: 'main.tex',
        },
      },
      providers: {
        EditorSelectionProvider: makeEditorSelectionProvider(
          EditorSelection.single(0, 9)
        ),
        EditorViewProvider: makeEditorViewProvider(
          'Old title',
          dispatch,
          focus
        ),
      },
    })

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Write a replacement heading.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/\\section\{Intro\}/)

    fireEvent.click(screen.getByRole('button', { name: 'Insert into editor' }))

    expect(dispatch).to.have.been.calledOnceWith({
      changes: { from: 0, to: 9, insert: '\\section{Intro}' },
      selection: { anchor: 15 },
      scrollIntoView: true,
    })
    expect(focus).to.have.been.calledOnce
  })

  it('renders a user-facing error when chat fails', async function () {
    mockConfig()
    fetchMock.post('/project/project123/ai/chat/stream', 503)

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Explain the current draft.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('AI request failed')
  })

  it('shows the streamed answer while the request is still active', async function () {
    mockConfig()
    fetchMock.post('/project/project123/ai/chat/stream', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        JSON.stringify({ type: 'delta', delta: 'Streaming ' }) +
        '\n' +
        JSON.stringify({ type: 'delta', delta: 'answer' }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          providerId: 'provider-one',
          model: 'model-one',
          context: {
            includedFiles: ['main.tex'],
            selectionIncluded: false,
            truncated: false,
          },
        }) +
        '\n',
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Stream the answer.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Streaming answer')
  })

  it('renders assistant Markdown while keeping user messages as text', async function () {
    mockConfig()
    mockChatStream({
      deltas: ['## Result\n\n- **Use** `\\\\cite{key}`\n\n'],
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: '**Do not render me**' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByRole('heading', { name: 'Result', level: 2 })
    screen.getByText('Use')
    screen.getByText(/\\cite\{key\}/)
    const transcript = document.querySelector('.ai-assistant-transcript')
    expect(transcript).not.to.equal(null)
    expect(
      within(transcript as HTMLElement).getAllByText('**Do not render me**')
    ).to.have.length(1)
  })

  it('renders chat answers in the readable transcript surface', async function () {
    mockConfig()
    mockChatStream()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Make this easy to read.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/Use \\cite\{\} here\./)

    const transcript = document.querySelector('.ai-assistant-transcript')
    expect(transcript?.classList.contains('ai-assistant-transcript-readable')).to
      .equal(true)
    expect(transcript?.getAttribute('data-scroll-owner')).to.equal('panel')
    expect(
      document
        .querySelector('.ai-assistant-message-assistant')
        ?.classList.contains('ai-assistant-message-document')
    ).to.equal(true)
  })

  it('runs agent mode and renders streamed tool events', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStream()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')
    expect(screen.queryByText('project-agent-default')).to.equal(null)
    expect(screen.queryByText('LaTeX 编译错误诊断')).to.equal(null)
    expect(screen.queryByText('LaTeX 核心 Agent 能力包')).to.equal(null)
    expect(screen.getByRole('button', { name: 'Start Act' })).to.have.property(
      'disabled',
      true
    )
    screen.getByText(
      'Send a Plan request first. Start Act unlocks when a plan is ready.'
    )

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Explain the project structure.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Work log')
    expect(screen.getByText('Work log').closest('details')?.open).to.equal(
      true
    )
    await screen.findByText('Tool call: project.read_file')
    screen.getByText('project.read_file')
    expect(screen.getAllByText('1 event')).not.to.be.empty
    await screen.findByText('Result')
    await screen.findByText('Agent answer')

    const createCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions'
    )[0]
    const turnCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/turns'
    )[0]
    expect(JSON.parse(createCall.options.body as string)).to.deep.equal({
      task: 'Explain the project structure.',
      providerId: 'provider-one',
      model: 'model-one',
    })
    expect(JSON.parse(turnCall.options.body as string)).to.deep.equal({
      prompt: 'Explain the project structure.',
      providerId: 'provider-one',
      model: 'model-one',
    })
  })

  it('keeps the agent composer after Plan and clears it after Act run', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentPlanThenActTurnStreamWithPatch()
    mockAgentStartAct()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    const prompt = screen.getByLabelText('Ask about this project')
    fireEvent.change(prompt, {
      target: { value: 'Explain the project structure.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Agent answer')
    expect(prompt).to.have.property('value', 'Explain the project structure.')

    fireEvent.click(screen.getByRole('button', { name: 'Start Act' }))
    await screen.findByText('Mode changed')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await screen.findByText('Patch review')
    expect(prompt).to.have.property('value', '')
  })

  it('shows Agent mode progress through Plan, Start Act, and Run review', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStream()
    mockAgentStartAct()

    const activeProgressStep = () =>
      screen
        .getByLabelText('Agent progress')
        .querySelector('.active')?.textContent

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    const progress = screen.getByLabelText('Agent progress')
    expect(progress.textContent).to.contain('Plan')
    expect(progress.textContent).to.contain('Start Act')
    expect(progress.textContent).to.contain('Run / review')
    expect(activeProgressStep()).to.contain('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Explain the project structure.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent answer')
    expect(activeProgressStep()).to.contain('Start Act')

    fireEvent.click(screen.getByRole('button', { name: 'Start Act' }))
    await screen.findByText('Act: ready')
    expect(activeProgressStep()).to.contain('Run / review')
  })

  it('shows a completed Act run as completed instead of ready', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStreamWithWorkspaceArtifacts()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Edit real files.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Run summary')
    await screen.findByText('Act: completed')
    screen.getByText(
      'Last Act run completed. Edit the prompt or press Run to continue.'
    )

    const runReviewStep = [
      ...screen.getByLabelText('Agent progress').querySelectorAll('li'),
    ].find(step => step.textContent?.includes('Run / review'))
    expect(runReviewStep?.classList.contains('done')).to.equal(true)
    expect(runReviewStep?.classList.contains('active')).to.equal(false)
  })

  it('collapses long Agent results until the user expands them', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStreamWithLongResult()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Write a long explanation.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Result')
    screen.getByText(/Visible result opening/)
    expect(screen.queryByText(/Hidden result tail/)).to.equal(null)

    fireEvent.click(screen.getByRole('button', { name: 'Show full result' }))
    screen.getByText(/Hidden result tail/)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse result' }))
    expect(screen.queryByText(/Hidden result tail/)).to.equal(null)
  })

  it('summarizes the current agent run and capabilities', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStream()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))

    await screen.findByText('Current run')
    screen.getByText('No active plan')
    screen.getByText('Direct project edits')
    screen.getByText('Checkpoint rollback')
    screen.getByText('External tools off')
    screen.getByText('1 skill')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Explain the project structure.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Plan ready')
    screen.getByText('Task')
    expect(screen.getAllByText('Explain the project structure.')).not.to.be
      .empty
  })

  it('consumes a pending Agent prompt from the compile diagnostics handoff', async function () {
    mockConfig()
    mockAgentConfig()
    customLocalStorage.setItem(
      'superpaper.ai-assistant.project123.pending-prefill',
      JSON.stringify({
        projectId: 'project123',
        mode: 'agent',
        prompt: 'Fix the compile error from main.tex:14.',
      })
    )

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    await screen.findByText('Current run')
    expect(
      screen.getByRole('button', { name: 'Agent' }).getAttribute('aria-pressed')
    ).to.equal('true')
    expect(screen.getByLabelText('Ask about this project')).to.have.property(
      'value',
      'Fix the compile error from main.tex:14.'
    )
    expect(
      customLocalStorage.getItem(
        'superpaper.ai-assistant.project123.pending-prefill'
      )
    ).to.equal(null)
  })

  it('renders Cline checkpoints and workspace diffs as a readable run summary', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStreamWithWorkspaceArtifacts()
    fetchMock.post(
      '/project/project123/ai/agent/sessions/session-one/rollback-checkpoint',
      {
        session: mockAgentSessionPayload({
          status: 'completed',
          mode: 'act',
          task: 'Edit real files.',
        }),
        restoredCommitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        changedPaths: ['/main.tex'],
        event: {
          id: 'checkpoint-restore',
          sessionId: 'session-one',
          sequence: 4,
          type: 'checkpoint_restored',
          payload: {
            commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            changedPaths: ['/main.tex'],
          },
          createdAt: null,
        },
      }
    )

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Edit real files.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    const summary = await screen.findByRole('region', {
      name: 'Run summary',
    })
    expect(summary.textContent).to.contain('Run completed')
    expect(summary.textContent).to.contain('Workspace impact')
    expect(summary.textContent).to.contain(
      'Review or roll back before continuing.'
    )
    expect(
      summary.querySelectorAll('.ai-assistant-agent-run-summary-stat')
    ).to.have.length(3)
    screen.getByText('Changed files')
    screen.getByText('Next step')
    screen.getByText('Review changed files, compile, then keep or roll back.')
    expect(
      summary.querySelectorAll('.ai-assistant-agent-run-summary-path')
    ).to.have.length(2)
    const worklog = screen.getByText('Detailed work log').closest('details')
    expect(worklog?.open).to.equal(false)
    screen.getByText('Audit trail')
    screen.getByText('Open only when you need raw runtime details.')
    expect(screen.getAllByText('aaaaaaaa').length).to.be.at.least(2)
    expect(screen.getAllByText('bbbbbbbb').length).to.be.at.least(2)
    expect(screen.getAllByText('2 files changed').length).to.be.at.least(2)
    expect(screen.getAllByText('+3 additions').length).to.be.at.least(2)
    expect(screen.getAllByText('-1 deletion').length).to.be.at.least(2)
    screen.getAllByText('Checkpoint')
    screen.getByText('Workspace diff')
    expect(screen.getAllByText('/main.tex')).not.to.be.empty
    expect(screen.getAllByText('/refs.bib')).not.to.be.empty

    fireEvent.click(screen.getByRole('button', { name: 'Roll back to before' }))

    await screen.findByText('Checkpoint restored')
    const rollbackCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/rollback-checkpoint'
    )[0]
    expect(JSON.parse(rollbackCall.options.body as string)).to.deep.equal({
      commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
  })

  it('can float and drag the agent run summary panel', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStreamWithWorkspaceArtifacts()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Edit real files.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    const summary = await screen.findByRole('region', {
      name: 'Run summary',
    })
    expect(summary.classList.contains('floating')).to.equal(false)

    fireEvent.click(screen.getByRole('button', { name: 'Float run summary' }))
    expect(summary.classList.contains('floating')).to.equal(true)
    screen.getByRole('button', { name: 'Dock run summary' })

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Drag run summary' }),
      { clientX: 120, clientY: 80 }
    )
    fireEvent.mouseMove(window, { clientX: 160, clientY: 105 })
    fireEvent.mouseUp(window)

    expect(summary.getAttribute('style')).to.contain('translate(40px, 25px)')
  })

  it('filters raw Cline telemetry out of the readable agent worklog', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStreamWithClineTelemetry()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Inspect compile failure.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Run summary')
    screen.getByText('Workspace')
    screen.getByText('Tools')
    screen.getByText('Checkpoint')
    screen.getByText('Tool call: run_commands')
    screen.getByText('Tool result: run_commands')
    screen.getByText('3 events')
    screen.getByText('2 events')
    expect(screen.queryByText(/iteration_start/)).to.equal(null)
    expect(screen.queryByText(/content_start/)).to.equal(null)
    expect(screen.queryByText(/inputTokens/)).to.equal(null)
  })

  it('renders the Cline runtime context as a readable worklog policy summary', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStreamWithRuntimeContext()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Inspect runtime context.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Work log')
    screen.getByText(/Cline runtime: direct workspace writes enabled/)
    screen.getByText(/Skills: latex-compile-debug/)
    screen.getByText(/Plugins: latex-core/)
    screen.getByText(/Shell: enabled/)
    expect(screen.getAllByText(/External tools: disabled/)).not.to.be.empty
    screen.getByText(/MCP: disabled/)
    screen.getByText(/Subagents: disabled/)
    expect(screen.queryByText(/"toolPolicySummary"/)).to.equal(null)
  })

  it('continues the same agent session after switching providers', async function () {
    mockConfigWithTwoProviders()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStream({ repeat: 2 })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Plan the task.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent answer')

    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'provider-two' },
    })
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Continue on provider two.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    const secondTurnCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/turns'
    )[1]
    expect(JSON.parse(secondTurnCall.options.body as string)).to.deep.equal({
      prompt: 'Continue on provider two.',
      providerId: 'provider-two',
      model: 'model-two',
    })
    expect(
      fetchMock.callHistory.calls('/project/project123/ai/agent/sessions')
    ).to.have.length(1)
  })

  it('starts a fresh agent session after a failed agent turn', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSessionSequence([
      mockAgentSessionPayload({ id: 'session-one', task: 'First attempt.' }),
      mockAgentSessionPayload({ id: 'session-two', task: 'Try again.' }),
    ])
    mockAgentFailedTurnStream('session-one')
    mockAgentTurnStreamForSession('session-two', {
      answer: 'Fresh session answer',
      promptTask: 'Try again.',
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'First attempt.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent request failed')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Try again.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Fresh session answer')
    expect(
      fetchMock.callHistory.calls('/project/project123/ai/agent/sessions')
    ).to.have.length(2)
    expect(
      fetchMock.callHistory.calls(
        '/project/project123/ai/agent/sessions/session-one/turns'
      )
    ).to.have.length(1)
    expect(
      fetchMock.callHistory.calls(
        '/project/project123/ai/agent/sessions/session-two/turns'
      )
    ).to.have.length(1)

    const secondCreateCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions'
    )[1]
    const secondTurnCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-two/turns'
    )[0]
    expect(JSON.parse(secondCreateCall.options.body as string)).to.deep.equal({
      task: 'Try again.',
      providerId: 'provider-one',
      model: 'model-one',
    })
    expect(JSON.parse(secondTurnCall.options.body as string)).to.deep.equal({
      prompt: 'Try again.',
      providerId: 'provider-one',
      model: 'model-one',
    })
  })

  it('renders agent patch review and applies approved patches', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentPlanThenActTurnStreamWithPatch()
    mockAgentStartAct()
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/apply', {
      patch: {
        ...mockPatch(),
        status: 'applied',
        appliedAt: '2026-05-16T00:00:00.000Z',
        rollbackAvailable: true,
        compileResult: {
          ok: true,
          status: 'success',
          buildId: 'build-one',
          outputFiles: [{ path: 'output.pdf', type: 'pdf', size: 123 }],
          validationProblems: [],
        },
      },
    })
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/rollback', {
      patch: {
        ...mockPatch(),
        status: 'rolled_back',
        appliedAt: '2026-05-16T00:00:00.000Z',
        rolledBackAt: '2026-05-16T00:01:00.000Z',
        rollbackAvailable: false,
        compileResult: {
          ok: true,
          status: 'success',
          buildId: 'build-two',
          outputFiles: [{ path: 'output.pdf', type: 'pdf', size: 123 }],
          validationProblems: [],
        },
      },
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Update wording.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent answer')
    fireEvent.click(screen.getByRole('button', { name: 'Start Act' }))
    await screen.findByText('Mode changed')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await screen.findByText('Patch review')
    expect(screen.getAllByText('Update wording')).not.to.be.empty
    fireEvent.click(screen.getByText('Review diff'))
    screen.getByText('/main.tex')
    screen.getByText('-Old sentence.')
    screen.getByText('+New sentence.')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await screen.findByText('applied')
    await screen.findByText('Compile: success')
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }))

    await screen.findByText('rolled back')
    await screen.findByText('Act: completed')
    const applyCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/apply'
    )[0]
    expect(JSON.parse(applyCall.options.body as string)).to.deep.equal({})
    const rollbackCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/rollback'
    )[0]
    expect(JSON.parse(rollbackCall.options.body as string)).to.deep.equal({})
  })

  it('rejects agent patches from the review panel', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentPlanThenActTurnStreamWithPatch()
    mockAgentStartAct()
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/reject', {
      patch: {
        ...mockPatch(),
        status: 'rejected',
      },
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Update wording.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent answer')
    fireEvent.click(screen.getByRole('button', { name: 'Start Act' }))
    await screen.findByText('Mode changed')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await screen.findByText('Patch review')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    await screen.findByText('rejected')
    await screen.findByText('Act: completed')
    const rejectCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/reject'
    )[0]
    expect(JSON.parse(rejectCall.options.body as string)).to.deep.equal({})
  })
})

function mockConfig() {
  fetchMock.get('/project/project123/ai/config', {
    providers: [
      {
        id: 'provider-one',
        name: 'Provider One',
        models: [{ id: 'model-one', displayName: 'Model One', enabled: true }],
        defaultModel: 'model-one',
      },
    ],
  })
}

function mockConfigWithTwoProviders() {
  fetchMock.get('/project/project123/ai/config', {
    providers: [
      {
        id: 'provider-one',
        name: 'Provider One',
        models: [{ id: 'model-one', displayName: 'Model One', enabled: true }],
        defaultModel: 'model-one',
      },
      {
        id: 'provider-two',
        name: 'Provider Two',
        models: [{ id: 'model-two', displayName: 'Model Two', enabled: true }],
        defaultModel: 'model-two',
      },
    ],
  })
}

function mockChatStream(
  overrides: {
    repeat?: number
    deltas?: string[]
  } & Record<string, unknown> = {}
) {
  const response = {
    providerId: 'provider-one',
    model: 'model-one',
    context: {
      includedFiles: ['main.tex'],
      selectionIncluded: true,
      truncated: false,
    },
    ...overrides,
  } as {
    providerId: string
    model: string
    context: {
      includedFiles: string[]
      selectionIncluded: boolean
      truncated: boolean
    }
  }
  const { deltas = ['Use ', '\\\\cite{} here.'], repeat } = overrides
  const deltaLines = deltas
    .map(delta => JSON.stringify({ type: 'delta', delta }) + '\n')
    .join('')

  fetchMock.post(
    '/project/project123/ai/chat/stream',
    {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: deltaLines + JSON.stringify({ type: 'done', ...response }) + '\n',
    },
    { repeat: repeat ?? 1 }
  )
}

function mockAgentConfig() {
  fetchMock.get('/project/project123/ai/agent/config', {
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
    skills: [
      {
        id: 'latex-compile-debug',
        name: 'latex-compile-debug',
        displayName: 'LaTeX 编译错误诊断',
        description: 'Analyze compile errors',
        modelInvocable: true,
        requiredTools: ['project.read_file'],
        enabled: true,
        scope: 'builtin',
        pluginId: 'latex-core',
      },
    ],
    plugins: [
      {
        id: 'latex-core',
        name: 'latex-core',
        version: '1.0.0',
        displayName: 'LaTeX 核心 Agent 能力包',
        description: 'Built-in LaTeX tools',
        enabled: true,
        skills: ['latex-compile-debug'],
        toolPresets: ['latex-readonly'],
        scope: 'builtin',
      },
    ],
    enabledSkillIds: ['latex-compile-debug'],
    enabledPluginIds: ['latex-core'],
    instructionProfiles: [],
  })
}

function mockAgentSession() {
  fetchMock.post('/project/project123/ai/agent/sessions', {
    session: mockAgentSessionPayload(),
  })
}

type MockAgentSessionPayload = {
  id: string
  projectId: string
  userId: string
  status: string
  mode: 'plan' | 'act'
  providerId: string
  model: string
  task: string
  instructionSources: never[]
  enabledSkillIds: string[]
  enabledPluginIds: string[]
  permissionProfileId: string
}

function mockAgentSessionSequence(sessions: MockAgentSessionPayload[]) {
  let sessionIndex = 0
  fetchMock.post(
    '/project/project123/ai/agent/sessions',
    () => ({ session: sessions[sessionIndex++] }),
    { repeat: sessions.length }
  )
}

function mockAgentSessionPayload(
  overrides: Partial<MockAgentSessionPayload> = {}
): MockAgentSessionPayload {
  return {
    id: 'session-one',
    projectId: 'project123',
    userId: 'user-one',
    status: 'planning',
    mode: 'plan',
    providerId: 'provider-one',
    model: 'model-one',
    task: 'Explain the project structure.',
    instructionSources: [],
    enabledSkillIds: [],
    enabledPluginIds: [],
    permissionProfileId: 'project-agent-default',
    ...overrides,
  }
}

function mockAgentTurnStream(options: { repeat?: number } = {}) {
  fetchMock.post(
    '/project/project123/ai/agent/sessions/session-one/turns',
    {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        JSON.stringify({
          type: 'event',
          event: {
            id: 'event-one',
            sessionId: 'session-one',
            sequence: 1,
            type: 'tool_call',
            payload: { name: 'project.read_file' },
            createdAt: null,
          },
        }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          session: {
            id: 'session-one',
            projectId: 'project123',
            userId: 'user-one',
            status: 'waiting_for_act',
            mode: 'plan',
            providerId: 'provider-one',
            model: 'model-one',
            task: 'Explain the project structure.',
            instructionSources: [],
            enabledSkillIds: ['latex-compile-debug'],
            enabledPluginIds: ['latex-core'],
            permissionProfileId: 'project-agent-default',
          },
          answer: 'Agent answer',
        }) +
        '\n',
    },
    { repeat: options.repeat ?? 1 }
  )
}

function mockAgentTurnStreamWithLongResult() {
  fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'done',
        session: mockAgentSessionPayload({
          status: 'waiting_for_act',
          mode: 'plan',
          task: 'Write a long explanation.',
        }),
        answer: [
          'Visible result opening',
          ...Array.from(
            { length: 18 },
            (_, index) => `Detailed result line ${index + 1}`
          ),
          'Hidden result tail',
        ].join('\n\n'),
      }) + '\n',
  })
}

function mockAgentTurnStreamWithWorkspaceArtifacts() {
  fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'event',
        event: {
          id: 'checkpoint-before',
          sessionId: 'session-one',
          sequence: 1,
          type: 'checkpoint_created',
          payload: {
            phase: 'before',
            commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'event',
        event: {
          id: 'workspace-diff',
          sessionId: 'session-one',
          sequence: 2,
          type: 'workspace_diff',
          payload: {
            diff: [
              'diff --git a/main.tex b/main.tex',
              'index 1111111..2222222 100644',
              '--- a/main.tex',
              '+++ b/main.tex',
              '@@ -1,2 +1,3 @@',
              ' Hello',
              '-Old sentence.',
              '+New sentence.',
              '+Added sentence.',
              'diff --git a/refs.bib b/refs.bib',
              'new file mode 100644',
              '--- /dev/null',
              '+++ b/refs.bib',
              '@@ -0,0 +1 @@',
              '+@article{key}',
            ].join('\n'),
          },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'event',
        event: {
          id: 'checkpoint-after',
          sessionId: 'session-one',
          sequence: 3,
          type: 'checkpoint_created',
          payload: {
            phase: 'after',
            commitHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'done',
        session: mockAgentSessionPayload({
          status: 'completed',
          mode: 'act',
          task: 'Edit real files.',
        }),
        answer: 'Agent answer',
      }) +
      '\n',
  })
}

function mockAgentTurnStreamWithClineTelemetry() {
  fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      [
        {
          type: 'event',
          event: {
            id: 'checkpoint-before',
            sessionId: 'session-one',
            sequence: 1,
            type: 'checkpoint_created',
            payload: {
              phase: 'before',
              commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            },
            createdAt: null,
          },
        },
        {
          type: 'event',
          event: {
            id: 'cline-status',
            sessionId: 'session-one',
            sequence: 2,
            type: 'message',
            payload: { role: 'system', kind: 'cline_status' },
            createdAt: null,
          },
        },
        {
          type: 'event',
          event: {
            id: 'iteration-start',
            sessionId: 'session-one',
            sequence: 3,
            type: 'message',
            payload: {
              role: 'assistant',
              content: '{"type":"iteration_start","iteration":1}',
            },
            createdAt: null,
          },
        },
        {
          type: 'event',
          event: {
            id: 'usage',
            sessionId: 'session-one',
            sequence: 4,
            type: 'message',
            payload: {
              role: 'assistant',
              content:
                '{"type":"usage","inputTokens":987,"outputTokens":36}',
            },
            createdAt: null,
          },
        },
        {
          type: 'event',
          event: {
            id: 'tool-call',
            sessionId: 'session-one',
            sequence: 5,
            type: 'tool_call',
            payload: { name: 'run_commands', input: { commands: ['ls'] } },
            createdAt: null,
          },
        },
        {
          type: 'event',
          event: {
            id: 'content-start',
            sessionId: 'session-one',
            sequence: 6,
            type: 'message',
            payload: {
              role: 'assistant',
              content:
                '{"type":"content_start","contentType":"tool","toolName":"run_commands"}',
            },
            createdAt: null,
          },
        },
        {
          type: 'event',
          event: {
            id: 'tool-result',
            sessionId: 'session-one',
            sequence: 7,
            type: 'tool_result',
            payload: { name: 'run_commands', result: { stdout: 'ok' } },
            createdAt: null,
          },
        },
        {
          type: 'done',
          session: mockAgentSessionPayload({
            status: 'waiting_for_act',
            mode: 'plan',
            task: 'Inspect compile failure.',
          }),
          answer: 'Readable compile plan',
        },
      ]
        .map(event => JSON.stringify(event))
        .join('\n') + '\n',
  })
}

function mockAgentTurnStreamWithRuntimeContext() {
  fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      [
        {
          type: 'event',
          event: {
            id: 'runtime-context',
            sessionId: 'session-one',
            sequence: 1,
            type: 'message',
            payload: {
              role: 'system',
              kind: 'context',
              content: 'Cline runtime: direct workspace writes enabled.',
              enabledSkillIds: ['latex-compile-debug'],
              enabledPluginIds: ['latex-core'],
              permissionProfileId: 'project-agent-default',
              toolPolicySummary: {
                directWorkspaceWrites: true,
                shellEnabled: true,
                externalToolsEnabled: false,
                mcpEnabled: false,
                spawnAgentEnabled: false,
                agentTeamsEnabled: false,
              },
            },
            createdAt: null,
          },
        },
        {
          type: 'done',
          session: mockAgentSessionPayload({
            status: 'waiting_for_act',
            mode: 'plan',
            task: 'Inspect runtime context.',
          }),
          answer: 'Readable runtime context',
        },
      ]
        .map(event => JSON.stringify(event))
        .join('\n') + '\n',
  })
}

function mockAgentFailedTurnStream(sessionId: string) {
  fetchMock.post(`/project/project123/ai/agent/sessions/${sessionId}/turns`, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'error',
        error: {
          code: 'CLINE_AGENT_ERROR',
          message: 'Agent request failed',
        },
      }) + '\n',
  })
}

function mockAgentTurnStreamForSession(
  sessionId: string,
  {
    answer,
    promptTask,
  }: {
    answer: string
    promptTask: string
  }
) {
  fetchMock.post(`/project/project123/ai/agent/sessions/${sessionId}/turns`, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'event',
        event: {
          id: `event-${sessionId}`,
          sessionId,
          sequence: 1,
          type: 'tool_call',
          payload: { name: 'project.read_file' },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'done',
        session: mockAgentSessionPayload({
          id: sessionId,
          status: 'completed',
          mode: 'act',
          task: promptTask,
          enabledSkillIds: ['latex-compile-debug'],
          enabledPluginIds: ['latex-core'],
        }),
        answer,
      }) +
      '\n',
  })
}

function mockAgentStartAct() {
  fetchMock.post(
    '/project/project123/ai/agent/sessions/session-one/start-act',
    {
      session: {
        id: 'session-one',
        projectId: 'project123',
        userId: 'user-one',
        status: 'ready_for_act',
        mode: 'act',
        providerId: 'provider-one',
        model: 'model-one',
        task: 'Update wording.',
        instructionSources: [],
        enabledSkillIds: ['latex-compile-debug'],
        enabledPluginIds: ['latex-core'],
        permissionProfileId: 'project-agent-default',
      },
    }
  )
}

function mockAgentPlanThenActTurnStreamWithPatch() {
  let callCount = 0
  fetchMock.post(
    '/project/project123/ai/agent/sessions/session-one/turns',
    () => {
      callCount += 1
      return callCount === 1
        ? mockAgentPlanResponse()
        : mockAgentPatchResponse()
    },
    { repeat: 2 }
  )
}

function mockAgentPlanResponse() {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'event',
        event: {
          id: 'event-one',
          sessionId: 'session-one',
          sequence: 1,
          type: 'tool_call',
          payload: { name: 'project.read_file' },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'done',
        session: {
          id: 'session-one',
          projectId: 'project123',
          userId: 'user-one',
          status: 'waiting_for_act',
          mode: 'plan',
          providerId: 'provider-one',
          model: 'model-one',
          task: 'Update wording.',
          instructionSources: [],
          enabledSkillIds: ['latex-compile-debug'],
          enabledPluginIds: ['latex-core'],
          permissionProfileId: 'project-agent-default',
        },
        answer: 'Agent answer',
      }) +
      '\n',
  }
}

function mockAgentPatchResponse() {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'event',
        event: {
          id: 'event-two',
          sessionId: 'session-one',
          sequence: 2,
          type: 'patch_created',
          payload: { patch: mockPatch() },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'done',
        session: {
          id: 'session-one',
          projectId: 'project123',
          userId: 'user-one',
          status: 'waiting_for_approval',
          mode: 'act',
          providerId: 'provider-one',
          model: 'model-one',
          task: 'Update wording.',
          instructionSources: [],
          enabledSkillIds: ['latex-compile-debug'],
          enabledPluginIds: ['latex-core'],
          permissionProfileId: 'project-agent-default',
        },
        answer: 'Patch ready for review.',
      }) +
      '\n',
  }
}

function mockPatch() {
  return {
    id: 'patch-one',
    sessionId: 'session-one',
    projectId: 'project123',
    createdByUserId: 'user-one',
    status: 'pending',
    baseRevision: {},
    summary: 'Update wording',
    riskLevel: 'low',
    createdAt: null,
    appliedAt: null,
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        docId: 'doc-main',
        oldText: 'Old sentence.',
        newText: 'New sentence.',
        baseSha256: 'a'.repeat(64),
        proposedSha256: 'b'.repeat(64),
        baseRev: 7,
        diff: {
          path: '/main.tex',
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 2,
          lines: [
            { type: 'context', content: '\\begin{document}' },
            { type: 'remove', content: 'Old sentence.' },
            { type: 'add', content: 'New sentence.' },
          ],
        },
      },
    ],
  }
}

function makeEditorSelectionProvider(editorSelection: EditorSelection) {
  const EditorSelectionProvider: FC<PropsWithChildren> = ({ children }) => {
    const [selection, setSelection] = useState<EditorSelection | undefined>(
      editorSelection
    )
    const value = useMemo<ReturnType<typeof useEditorSelectionContext>>(() => {
      return {
        editorSelection: selection,
        setEditorSelection: setSelection,
      }
    }, [selection])

    return (
      <EditorSelectionContext.Provider value={value}>
        {children}
      </EditorSelectionContext.Provider>
    )
  }

  return EditorSelectionProvider
}

function makeEditorViewProvider(
  content: string,
  dispatch: (transaction: unknown) => void = () => {},
  focus: () => void = () => {}
) {
  const EditorViewProvider: FC<PropsWithChildren> = ({ children }) => {
    const value = useMemo(() => {
      return {
        view: {
          dispatch,
          focus,
          state: {
            doc: {
              length: content.length,
              toString() {
                return content
              },
            },
            sliceDoc(from: number, to: number) {
              return content.slice(from, to)
            },
          },
        } as any,
        setView: () => {},
      }
    }, [])

    return (
      <EditorViewContext.Provider value={value}>
        {children}
      </EditorViewContext.Provider>
    )
  }

  return EditorViewProvider
}
