# Cline Route Regression Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current clean single-agent Cline route by turning the latest manual findings into repeatable tests, fresh verification evidence, and an explicit distance-to-complete record.

**Architecture:** Keep the runtime path unchanged: Cline remains the only normal project agent runtime, running directly against the git-backed project workspace with superPaper-owned checkpoints and rollback. This phase only tightens UI state, documentation, and regression evidence around that route.

**Tech Stack:** React/TypeScript, Mocha frontend tests, Vitest backend tests, `@cline/sdk` 0.0.41, local browser smoke on `http://127.0.0.1:23000`.

---

## File Structure

- Modify `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
  - Keep the persisted composer prompt after Plan so Start Act can reuse it, then clear it after a successful Act/Run turn.
- Modify `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
  - Add a regression test that fails if Plan clears too early or Act/Run leaves the submitted prompt in the textarea.
- Modify `docs/superpowers/plans/2026-05-21-cline-sdk-policy-and-regression.md`
  - Record the fresh broader verification commands and browser context smoke.
- Modify `docs/superpowers/plans/2026-05-20-cline-primary-agent-runtime.md`
  - Update the remaining-gap summary now that rollback browser smoke, explicit SDK policy, selected skills, and runtime context rendering are done.

## Current Status

Started on 2026-05-21 after the explicit Cline SDK policy phase. The route is already direct-Cline-first: normal agent turns prepare the project filesystem workspace, run `ClineCore.start`, stream mapped Cline events into `AgentEvent`, create before/after checkpoints, render workspace diffs, and allow rollback to the before checkpoint.

## Task 1: Agent Composer Prompt Regression

- [x] **Step 1: Write the failing frontend test**

In `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`, add a test named `keeps the agent composer after Plan and clears it after Act run`:

```ts
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
```

- [x] **Step 2: Run the red frontend test**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "keeps the agent composer"
```

Expected before implementation: fail because clearing unconditionally after Plan breaks the Plan -> Act bridge, or because never clearing leaves the Act/Run prompt stale.

- [x] **Step 3: Implement the minimal UI fix**

In `runAgent`, after the streamed response succeeds:

```ts
setAgentSession(response.session)
setAgentAnswer(response.answer)
if (response.session.mode === 'act') {
  setPrompt('')
}
```

- [x] **Step 4: Run the green frontend test**

Run the same focused Mocha command. Expected: 1 passing.

## Task 2: Documentation And Distance Record

- [x] **Step 1: Update the SDK policy plan**

Append fresh verification results to `docs/superpowers/plans/2026-05-21-cline-sdk-policy-and-regression.md`, including backend bundle, frontend bundle, lint, `git diff --check`, and browser smoke.

- [x] **Step 2: Update the primary route gap summary**

In `docs/superpowers/plans/2026-05-20-cline-primary-agent-runtime.md`, replace stale remaining gaps with the current state:

- Done: direct Cline runtime, root provider real smoke, direct workspace writes, file-tree refresh, open-doc sync, checkpoints, workspace diff cards, rollback, explicit SDK tool policy, selected skills, workspace metadata, readable runtime context.
- Remaining: Cline workspace index/prewarm UI, optional MCP settings integration, richer shell/tool permission UI, durable browser smoke command, final removal of patch-review legacy catalog compatibility.

## Task 3: Verification Bundle

- [x] **Step 1: Run broader backend focused tests**

```bash
corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectController.test.mjs test/unit/src/AiAgent/AgentEventModel.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs
```

Expected: all selected backend tests pass.

- [x] **Step 2: Run broader frontend focused tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ide-react/components/rail-tab.test.tsx test/frontend/features/integrations-panel/integrations-panel.test.tsx test/frontend/features/pdf-preview/util/compiler.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

Expected: all selected frontend tests pass.

- [x] **Step 3: Run lint and whitespace checks**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs app/src/Features/AiAgent/AiAgentRuntime.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs
cd ../..
git diff --check
```

Expected: both commands pass.

## Task 4: Real Browser Context Smoke

- [x] **Step 1: Open the running local app**

Use the available browser tooling or local Playwright fallback to open `http://127.0.0.1:23000`, log in as the existing local browser test user, open project `6a0da04be1d53948727c0876`, and open AI Assistant.

- [x] **Step 2: Verify provider and runtime context**

Confirm the AI panel shows the real root channel provider and model list. Run a low-impact Agent prompt with the configured root provider and verify the worklog includes:

- `Cline runtime`
- `Skills:`
- `Shell: enabled`
- `External tools: disabled`
- `MCP: disabled`
- `Subagents: disabled`

- [x] **Step 3: Capture evidence**

Save a screenshot under `output/playwright/` and record the observed URL/project/session details in the SDK policy plan.

## Verification Results

- Focused red test before final implementation: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "keeps the agent composer"` -> failed because Plan cleared the textarea too early.
- Focused green test after final implementation: same command -> 1 passing.
- Backend focused bundle: `corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectController.test.mjs test/unit/src/AiAgent/AgentEventModel.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs` -> 10 files, 155 tests passed.
- Frontend focused bundle: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ide-react/components/rail-tab.test.tsx test/frontend/features/integrations-panel/integrations-panel.test.tsx test/frontend/features/pdf-preview/util/compiler.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` -> 33 tests passed.
- Lint/diff: targeted `eslint` command and `git diff --check` -> both passed.
- Real browser context smoke: project `6a0da04be1d53948727c0876`, session `6a0f200c2515e0764612781d`, provider `Root Channel Provider`, model `gpt-5.2`. The expanded worklog rendered `Cline runtime`, `Skills: none`, `Plugins: latex-core`, `Shell: enabled`, `External tools: disabled`, `MCP: disabled`, and `Subagents: disabled`. The run created before/after checkpoint cards at `c1e07a6b` with no workspace file changes. Screenshot: `output/playwright/superpaper-cline-runtime-context-20260521.png`.
