# Cline SDK Policy And Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the clean single-agent Cline route by making the SDK tool policy explicit, recording a readable runtime context event, and keeping browser-regression evidence repeatable.

**Architecture:** Keep Cline as the only normal agent runtime. Build an explicit superPaper Cline tool policy from the project agent configuration, pass selected skills through the SDK `skills` allowlist and workspace metadata, and emit a sanitized context event before the Cline run so users can see which direct-edit capabilities are active.

**Tech Stack:** Node.js ESM, React/TypeScript, Vitest, Mocha, `@cline/sdk` 0.0.41, existing `AgentEvent` worklog rendering.

---

## File Structure

- Modify `services/web/app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs`
  - Add explicit Cline tool-policy construction.
  - Pass `skills`, `workspaceMetadata`, `checkpoint: { enabled: false }`, and single-agent feature flags to `cline.start`.
  - Keep provider secrets out of prompts and metadata.
- Modify `services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs`
  - Record a `message`/`context` event that summarizes selected skills, plugins, permission profile, and direct workspace policy before streaming Cline events.
- Modify `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
  - Render the runtime context event as a concise readable worklog item instead of JSON.
- Modify tests:
  - `services/web/test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs`
  - `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`
  - `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- Update this plan and `docs/superpowers/plans/2026-05-20-cline-primary-agent-runtime.md` with verification results.

## Current Status

Started on 2026-05-21 after the checkpoint rollback hardening phase. NPM confirms `@cline/sdk@0.0.41` is the current `latest` release; the installed workspace version already matches it.

## Task 1: Explicit Cline SDK Tool Policy

- [x] **Step 1: Write the failing adapter test**

In `services/web/test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs`, add assertions that a direct superPaper Cline run:

```js
expect(ctx.ClineCore.create).to.have.been.calledWith(
  sinon.match({
    toolPolicies: sinon.match({
      read_files: { enabled: true, autoApprove: true },
      search_codebase: { enabled: true, autoApprove: true },
      run_commands: { enabled: true, autoApprove: true },
      apply_patch: { enabled: true, autoApprove: true },
      editor: { enabled: true, autoApprove: true },
      fetch_web_content: { enabled: false, autoApprove: false },
      ask_question: { enabled: false, autoApprove: false },
      team_spawn_teammate: { enabled: false, autoApprove: false },
    }),
  })
)
```

Also assert `cline.start` receives:

```js
expect(startConfig.skills).to.deep.equal(['academic-polish'])
expect(startConfig.checkpoint).to.deep.equal({ enabled: false })
expect(startConfig.workspaceMetadata).to.contain('superPaper project project-1')
expect(startConfig.workspaceMetadata).not.to.contain('plain-key')
```

- [x] **Step 2: Run the red adapter test**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs -t "uses an explicit superPaper Cline tool policy"
```

Expected before implementation: fail because the adapter passes Cline's raw `yolo` policy and does not set `skills`, `checkpoint`, or `workspaceMetadata`.

- [x] **Step 3: Implement the explicit SDK policy**

In `ClineAgentRuntimeAdapter.mjs`:

```js
const clineToolPolicies = buildClineToolPolicies(agentContext, clineSdk)
const cline = await clineSdk.ClineCore.create({
  clientName: CLINE_CLIENT_NAME,
  backendMode: 'local',
  toolPolicies: clineToolPolicies,
})
```

Add helpers:

```js
function buildClineToolPolicies(agentContext, clineSdk) {
  const externalToolsEnabled =
    agentContext.permissionProfile?.externalToolsEnabled === true
  const policies = {
    '*': { enabled: false, autoApprove: false },
    read_files: autoApprovedToolPolicy(),
    search_codebase: autoApprovedToolPolicy(),
    run_commands: autoApprovedToolPolicy(),
    apply_patch: autoApprovedToolPolicy(),
    editor: autoApprovedToolPolicy(),
    skills: autoApprovedToolPolicy(),
    submit_and_exit: autoApprovedToolPolicy(),
    fetch_web_content: externalToolsEnabled
      ? autoApprovedToolPolicy()
      : disabledToolPolicy(),
    ask_question: disabledToolPolicy(),
  }
  for (const toolName of clineSdk.TEAM_TOOL_NAMES || []) {
    policies[toolName] = disabledToolPolicy()
  }
  return policies
}
```

Add Cline start config fields:

```js
skills: getSelectedClineSkillIds(agentContext),
workspaceMetadata: buildClineWorkspaceMetadata({ projectId, userId, agentContext }),
checkpoint: { enabled: false },
```

- [x] **Step 4: Run the green adapter test**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs
```

Expected: pass.

## Task 2: Runtime Context Event

- [x] **Step 1: Write the failing runtime test**

In `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`, add a test named `records a readable Cline runtime context event before Cline starts`.

Expected assertions:

```js
expect(ctx.AgentEvent.create).to.have.been.calledWith(
  sinon.match({
    type: 'message',
    payload: sinon.match({
      role: 'system',
      kind: 'context',
      content: sinon.match('Cline runtime'),
      enabledSkillIds: ['latex-compile-debug'],
      enabledPluginIds: ['latex-core'],
      permissionProfileId: 'project-agent-default',
      toolPolicySummary: sinon.match({
        directWorkspaceWrites: true,
        shellEnabled: true,
        externalToolsEnabled: false,
        mcpEnabled: false,
        spawnAgentEnabled: false,
        agentTeamsEnabled: false,
      }),
    }),
  })
)
expect(ctx.ClineAgentRuntimeAdapter.runTurn.calledAfter(ctx.AgentEvent.create)).to.equal(true)
```

- [x] **Step 2: Run the red runtime test**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/AiAgentRuntime.test.mjs -t "records a readable Cline runtime context event"
```

Expected before implementation: fail because no context event is recorded.

- [x] **Step 3: Implement context event recording**

In `AiAgentRuntime.mjs`, after session metadata is persisted and before invoking the adapter, call:

```js
await eventRecorder.record('message', buildClineRuntimeContextPayload(agentContext))
```

The payload must be sanitized, stable, and must not include provider API keys.

- [x] **Step 4: Run runtime tests**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/AiAgentRuntime.test.mjs
```

Expected: pass after updating focused expectations that now include the context event.

## Task 3: Readable Worklog Rendering

- [x] **Step 1: Write the failing frontend test**

In `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`, add a stream event:

```js
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
}
```

Assert that the worklog shows:

```js
screen.getByText('Cline runtime')
screen.getByText(/Skills: latex-compile-debug/)
screen.getByText(/Shell: enabled/)
screen.getByText(/External tools: disabled/)
expect(screen.queryByText(/"toolPolicySummary"/)).to.equal(null)
```

- [x] **Step 2: Run the red frontend test**

Run:

```bash
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "runtime context"
```

Expected before implementation: fail because the payload renders as generic text/JSON.

- [x] **Step 3: Implement readable formatting**

In `ai-assistant-panel.tsx`, update `formatAgentEventTitle`, `formatAgentEventSnippet`, and `formatAgentEventPayload` for `message` events with `kind === 'context'`. Render lines for selected skills/plugins and boolean policy state.

- [x] **Step 4: Run the green frontend test**

Run:

```bash
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "runtime context"
```

Expected: pass.

## Task 4: Verification Bundle

- [x] **Step 1: Run backend focused tests**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs
```

Expected: pass.

- [x] **Step 2: Run frontend focused tests**

Run:

```bash
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

Expected: pass.

- [x] **Step 3: Run lint and diff checks**

Run:

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs app/src/Features/AiAgent/AiAgentRuntime.mjs frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
cd ../..
git diff --check
```

Expected: both commands pass.

## Follow-Up Verification

Fresh closeout verification from 2026-05-21:

- `corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectController.test.mjs test/unit/src/AiAgent/AgentEventModel.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs` -> 10 files, 155 tests passed.
- `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ide-react/components/rail-tab.test.tsx test/frontend/features/integrations-panel/integrations-panel.test.tsx test/frontend/features/pdf-preview/util/compiler.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` -> 33 tests passed.
- `node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs app/src/Features/AiAgent/AiAgentRuntime.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs` -> passed.
- `git diff --check` -> passed.
- Real browser smoke using `Root Channel Provider` / `gpt-5.2` on project `6a0da04be1d53948727c0876`, session `6a0f200c2515e0764612781d`:
  - The AI Assistant panel exposed the real root provider and model list: `gpt-5.2`, `gpt-5.3-codex`, `gpt-5.4`, `gpt-5.5`.
  - A low-impact Agent prompt asked Cline to inspect context without editing files.
  - The expanded worklog rendered the live runtime context as readable text: `Cline runtime`, `Skills: none`, `Plugins: latex-core`, `Shell: enabled`, `External tools: disabled`, `MCP: disabled`, and `Subagents: disabled`.
  - Before/after checkpoint cards both showed `c1e07a6b`, confirming the run produced no workspace file changes.
  - Screenshot: `output/playwright/superpaper-cline-runtime-context-20260521.png`.
