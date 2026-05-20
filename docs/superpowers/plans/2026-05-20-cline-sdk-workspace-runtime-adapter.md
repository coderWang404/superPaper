# Cline SDK Workspace Runtime Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route filesystem-backed project agent turns through Cline SDK/Core with the project workspace as the real working directory.

**Architecture:** Add a focused `ClineAgentRuntimeAdapter` behind the existing `AiAgentRuntime` session/event API. Filesystem projects use Cline SDK/Core, workspace git checkpoints, and event mapping; Mongo-backed projects keep the existing hand-written tool loop until migration removes it.

**Tech Stack:** Node.js ESM, Vitest, `@cline/sdk` 0.0.41, existing `AgentSession`/`AgentEvent` models, existing encrypted AI provider settings, `ProjectWorkspaceManager`, `ProjectCheckpointService`.

---

## Files

- Modify: `services/web/package.json`
  - Add runtime dependency `@cline/sdk`.
- Modify: `yarn.lock`
  - Lock `@cline/sdk` and `@cline/core`.
- Create: `services/web/app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs`
  - Lazily imports `@cline/sdk`.
  - Creates Cline Core sessions with workspace `cwd`.
  - Disables spawn/team features.
  - Passes provider model settings.
  - Records before/after checkpoints.
  - Maps Cline messages/tool/checkpoint/error events to superPaper `AgentEvent` shapes.
- Create: `services/web/test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs`
  - Covers workspace cwd, provider credentials, event mapping, checkpoints, and failure handling with mocked Cline SDK.
- Modify: `services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs`
  - Detect filesystem projects.
  - Route filesystem turns to `ClineAgentRuntimeAdapter.runTurn`.
  - Preserve the legacy hand-written loop for Mongo projects.
- Modify: `services/web/app/src/models/AgentEvent.mjs`
  - Add `checkpoint_created` and `workspace_diff` event types emitted by Cline workspace runs.
- Modify: `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`
  - Cover filesystem routing.
  - Cover Mongo projects still use the existing loop.

## Task 1: Add Cline SDK Dependency

**Files:**
- Modify: `services/web/package.json`
- Modify: `yarn.lock`

- [ ] **Step 1: Add dependency**

Run:

```bash
corepack yarn --cwd services/web add @cline/sdk@0.0.41
```

Expected: `services/web/package.json` includes `"@cline/sdk": "0.0.41"` or equivalent semver, and `yarn.lock` includes `@cline/sdk` plus `@cline/core`.

- [ ] **Step 2: Verify dependency can be resolved**

Run:

```bash
corepack yarn --cwd services/web node -e "import('@cline/sdk').then(m => { if (!m.ClineCore && !m.Agent) throw new Error('missing ClineCore/Agent export'); console.log(Object.keys(m).sort().join(',')) })"
```

Expected: exit 0 and output includes `ClineCore` or `Agent`.

- [ ] **Step 3: Commit dependency only**

Run:

```bash
git add services/web/package.json yarn.lock
git commit -m "Add Cline SDK dependency"
```

## Task 2: Cline Runtime Adapter

**Files:**
- Create: `services/web/test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs`
- Create: `services/web/app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs`

- [ ] **Step 1: Write failing adapter tests**

Create `services/web/test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs`:

```js
import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs'

async function collect(generator) {
  const values = []
  for await (const value of generator) values.push(value)
  return values
}

describe('ClineAgentRuntimeAdapter', function () {
  beforeEach(async function (ctx) {
    ctx.workspaceRoot = '/tmp/superpaper-workspace/project-1/workspace'
    ctx.ClineCore = {
      start: sinon.stub().returns({
        run: sinon.stub().returns(
          (async function* () {
            yield { type: 'message', role: 'assistant', content: 'Reading files' }
            yield {
              type: 'tool',
              name: 'read_file',
              input: { path: 'main.tex' },
              output: 'ok',
            }
            yield { type: 'assistant', content: 'Updated the paper.' }
          })()
        ),
        dispose: sinon.stub().resolves(),
      }),
    }
    ctx.ProjectWorkspaceManager = {
      getWorkspaceRoot: sinon.stub().returns(ctx.workspaceRoot),
    }
    ctx.ProjectCheckpointService = {
      createCheckpoint: sinon
        .stub()
        .onFirstCall()
        .resolves({ commitHash: 'before-commit' })
        .onSecondCall()
        .resolves({ commitHash: 'after-commit' }),
      diffWorktree: sinon.stub().resolves('diff --git a/main.tex b/main.tex'),
    }
    vi.doMock('@cline/sdk', () => ({
      ClineCore: ctx.ClineCore,
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectWorkspaceManager.mjs',
      () => ({
        default: ctx.ProjectWorkspaceManager,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectCheckpointService.mjs',
      () => ({
        default: ctx.ProjectCheckpointService,
      })
    )
    ctx.Adapter = await import(modulePath)
  })

  afterEach(function () {
    vi.resetModules()
  })

  it('runs ClineCore in the project workspace with spawn/team features disabled', async function (ctx) {
    const events = await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
        },
      })
    )

    expect(ctx.ProjectWorkspaceManager.getWorkspaceRoot).to.have.been.calledWith(
      'project-1'
    )
    expect(ctx.ClineCore.start).to.have.been.calledWith(
      sinon.match({
        config: sinon.match({
          cwd: ctx.workspaceRoot,
          workspaceRoot: ctx.workspaceRoot,
          enableSpawnAgent: false,
          enableAgentTeams: false,
        }),
        provider: sinon.match({
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
        }),
      })
    )
    expect(events.map(event => event.type)).to.deep.equal([
      'checkpoint_created',
      'message',
      'tool_call',
      'tool_result',
      'message',
      'workspace_diff',
      'checkpoint_created',
    ])
    expect(events[0].payload.phase).to.equal('before')
    expect(events[6].payload.phase).to.equal('after')
  })

  it('disposes the Cline runtime after a run', async function (ctx) {
    const runtime = ctx.ClineCore.start()
    ctx.ClineCore.start.returns(runtime)

    await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
        },
      })
    )

    expect(runtime.dispose).to.have.been.calledOnce
  })
})
```

- [ ] **Step 2: Run adapter tests and verify they fail**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs
```

Expected: FAIL because `ClineAgentRuntimeAdapter.mjs` does not exist.

- [ ] **Step 3: Implement adapter**

Create `services/web/app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs`:

```js
import ProjectWorkspaceManager from '../Project/ProjectWorkspaceManager.mjs'
import ProjectCheckpointService from '../Project/ProjectCheckpointService.mjs'

export async function* runTurn({
  projectId,
  userId,
  sessionId,
  prompt,
  provider,
}) {
  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  const before = await ProjectCheckpointService.createCheckpoint({
    projectId,
    actorType: 'agent',
    actorUserId: userId,
    agentSessionId: sessionId,
    summary: 'Before Cline agent run',
  })
  yield {
    type: 'checkpoint_created',
    payload: {
      phase: 'before',
      commitHash: before.commitHash,
    },
  }

  const { ClineCore, Agent } = await import('@cline/sdk')
  const runtimeFactory = ClineCore || Agent
  const runtime = runtimeFactory.start({
    config: {
      cwd: workspaceRoot,
      workspaceRoot,
      enableSpawnAgent: false,
      enableAgentTeams: false,
    },
    provider,
  })

  try {
    for await (const event of runtime.run({ prompt })) {
      for (const mapped of mapClineEvent(event)) {
        yield mapped
      }
    }
  } finally {
    await runtime.dispose?.()
  }

  const diff = await ProjectCheckpointService.diffWorktree({ projectId })
  if (diff) {
    yield {
      type: 'workspace_diff',
      payload: {
        diff,
      },
    }
  }
  const after = await ProjectCheckpointService.createCheckpoint({
    projectId,
    actorType: 'agent',
    actorUserId: userId,
    agentSessionId: sessionId,
    summary: 'After Cline agent run',
  })
  yield {
    type: 'checkpoint_created',
    payload: {
      phase: 'after',
      commitHash: after.commitHash,
    },
  }
}

export function mapClineEvent(event) {
  if (event.type === 'message' || event.type === 'assistant') {
    return [
      {
        type: 'message',
        payload: {
          role: event.role || 'assistant',
          content: event.content || '',
        },
      },
    ]
  }
  if (event.type === 'tool') {
    return [
      {
        type: 'tool_call',
        payload: {
          name: event.name,
          input: event.input || {},
        },
      },
      {
        type: 'tool_result',
        payload: {
          name: event.name,
          ok: event.error == null,
          result: event.output || null,
          error: event.error || null,
        },
      },
    ]
  }
  if (event.type === 'error') {
    return [
      {
        type: 'error',
        payload: {
          code: event.code || 'CLINE_AGENT_ERROR',
          message: event.message || 'Cline agent failed',
        },
      },
    ]
  }
  return [
    {
      type: 'message',
      payload: {
        role: 'assistant',
        kind: event.type || 'cline_event',
        content: JSON.stringify(event),
      },
    },
  ]
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit adapter**

Run:

```bash
git add services/web/app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs services/web/test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs
git commit -m "Add Cline workspace runtime adapter"
```

## Task 3: Route Filesystem Project Turns To Cline Adapter

**Files:**
- Modify: `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`
- Modify: `services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs`
- Modify: `services/web/app/src/models/AgentEvent.mjs`

- [ ] **Step 1: Add failing runtime routing test**

In `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`, extend setup:

```js
    ctx.ProjectGetter = {
      promises: {
        getProject: sinon.stub().resolves({
          _id: 'project-id',
          storageBackend: 'mongo',
        }),
      },
    }
    ctx.ClineAgentRuntimeAdapter = {
      runTurn: sinon.stub().callsFake(async function* () {
        yield {
          type: 'message',
          payload: {
            role: 'assistant',
            content: 'Cline changed the project.',
          },
        }
      }),
    }
```

Add mocks:

```js
    vi.doMock('../../../../app/src/Features/Project/ProjectGetter', () => ({
      default: ctx.ProjectGetter,
    }))
    vi.doMock(
      '../../../../app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs',
      () => ctx.ClineAgentRuntimeAdapter
    )
```

Add this test:

```js
  it('routes filesystem projects through the Cline adapter', async function (ctx) {
    ctx.ProjectGetter.promises.getProject.resolves({
      _id: 'project-id',
      storageBackend: 'filesystem',
    })

    const streamedEvents = []
    const result = await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Update the paper',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      onEvent: event => streamedEvents.push(event),
    })

    expect(ctx.ClineAgentRuntimeAdapter.runTurn).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Update the paper',
      provider: {
        baseURL: 'https://ai.example.test/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1',
      },
    })
    expect(ctx.createOpenAICompatibleChatCompletion).not.to.have.been.called
    expect(streamedEvents.map(event => event.type)).to.deep.equal([
      'message',
    ])
    expect(result.answer).to.equal('Cline changed the project.')
    expect(result.session.status).to.equal('completed')
  })
```

Add this guard test:

```js
  it('keeps mongo projects on the legacy tool loop', async function (ctx) {
    await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Explain the project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })

    expect(ctx.ClineAgentRuntimeAdapter.runTurn).not.to.have.been.called
    expect(ctx.createOpenAICompatibleChatCompletion).to.have.been.called
  })
```

- [ ] **Step 2: Run runtime test and verify filesystem route fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/AiAgent/AiAgentRuntime.test.mjs
```

Expected: FAIL because `AiAgentRuntime` does not inspect project storage backend or call `ClineAgentRuntimeAdapter`.

- [ ] **Step 3: Implement filesystem route**

Modify `services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs`:

```js
import ProjectGetter from '../Project/ProjectGetter.mjs'
import * as ClineAgentRuntimeAdapter from './ClineAgentRuntimeAdapter.mjs'
```

Inside `runTurn`, after session lookup/status/write permission checks and before creating the legacy event recorder, add:

```js
  const project = await ProjectGetter.promises.getProject(projectId, {
    storageBackend: 1,
  })
  if (project?.storageBackend === 'filesystem') {
    return await runClineFilesystemTurn({
      projectId,
      userId,
      session,
      prompt,
      providerId,
      model,
      onEvent,
    })
  }
```

Add helper below `runTurn`:

```js
async function runClineFilesystemTurn({
  projectId,
  userId,
  session,
  prompt,
  providerId,
  model,
  onEvent,
}) {
  const eventRecorder = await createEventRecorder({
    session,
    projectId,
    userId,
    onEvent,
  })
  await updateSessionStatus(session, 'running')
  try {
    const provider = await resolveProvider(providerId || session.providerId)
    const providerConfig = publicProviderConfig(provider)
    const selectedModel = model || session.model || providerConfig.defaultModel
    if (!providerConfig.models.some(availableModel => availableModel.id === selectedModel)) {
      throw new AiAgentError('AI_MODEL_NOT_AVAILABLE', 'AI model is not available')
    }
    const apiKey = await decryptApiKey(provider.encryptedApiKey)
    session.providerId = providerConfig.id
    session.model = selectedModel
    session.mode = 'act'
    await persistSessionMetadata(session)

    let finalAnswer = ''
    for await (const adapterEvent of ClineAgentRuntimeAdapter.runTurn({
      projectId,
      userId,
      sessionId: session._id,
      prompt,
      provider: {
        baseURL: provider.baseURL,
        apiKey,
        model: selectedModel,
      },
    })) {
      await eventRecorder.record(adapterEvent.type, adapterEvent.payload || {})
      if (
        adapterEvent.type === 'message' &&
        adapterEvent.payload?.role === 'assistant' &&
        adapterEvent.payload?.content
      ) {
        finalAnswer = adapterEvent.payload.content
      }
    }
    if (!finalAnswer) {
      finalAnswer = 'Cline agent run completed.'
    }
    await updateSessionStatus(session, 'completed')
    return {
      session: publicSession(session),
      answer: finalAnswer,
      events: eventRecorder.events,
    }
  } catch (err) {
    await updateSessionStatus(session, 'failed')
    await eventRecorder.record('error', {
      code: err.code || err.name || 'CLINE_AGENT_ERROR',
      message: safeErrorMessage(err),
    })
    throw err
  }
}
```

- [ ] **Step 4: Update event model enum**

Modify `services/web/app/src/models/AgentEvent.mjs` enum to include:

```js
        'checkpoint_created',
        'workspace_diff',
```

- [ ] **Step 5: Run runtime tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit routing**

Run:

```bash
git add services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs services/web/app/src/models/AgentEvent.mjs services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs
git commit -m "Route filesystem agent turns through Cline"
```

## Task 4: Final Verification

**Files:**
- All files changed in Tasks 1-3.

- [ ] **Step 1: Run focused AI agent runtime tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run filesystem project regression tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectEntityHandler.test.mjs test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs test/unit/src/Project/ProjectEditorHandler.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Compile/ClsiManager.test.mjs test/unit/src/Editor/EditorHttpController.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run frontend filesystem listener test**

Run:

```bash
corepack yarn --cwd services/web exec mocha --timeout 5000 --exit --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Check git status and commit any final fixes**

Run:

```bash
git status --short --branch
```

Expected: only intended Phase 6 files changed before final commit, or clean after commits.
