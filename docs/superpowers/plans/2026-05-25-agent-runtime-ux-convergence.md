# Agent Runtime UX Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the AI Assistant Agent rail feel coherent during real work by clarifying completed Act state, folding long results, reducing Work log clutter, tightening Chinese copy, and extending browser smoke coverage.

**Architecture:** Keep the backend/runtime untouched. Converge the rail in `AiAssistantPanel` with small pure-state helpers, localized labels, scoped CSS, and tests that exercise the same frontend path users see in the browser.

**Tech Stack:** React/TypeScript, i18next locale JSON, SCSS, Mocha frontend tests, Playwright smoke script.

---

## Current Findings

- Completed Act sessions currently show a green `Completed` chip, but the control row still says `Act: ready` and the progress step remains active on `Run / review`. This reads like the run is still waiting.
- Long Agent answers render as one full card. For long model output, the composer is pushed down and the rail becomes a scroll dump instead of a workbench.
- When a run summary exists, the detailed Work log still opens by default. This makes checkpoint/diff summary compete with raw details.
- zh-CN still exposes English labels such as `Plugins`, `Skills`, and `Subagents` in runtime summaries.
- Browser smoke verifies Cline runtime, run summary, compile diagnostic, and compile-error handoff. It does not yet assert completed-state copy or long-result folding.

## Task 1: Completed Act State Semantics

**Files:**
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/locales/en.json`
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/frontend/extracted-translations.json`

- [x] **Step 1: Write failing test**

Add a test that runs `mockAgentTurnStreamWithWorkspaceArtifacts()` and asserts:

```ts
await screen.findByText('Run summary')
await screen.findByText('Act: completed')
screen.getByText('Last Act run completed. Edit the prompt or press Run to continue.')
const runReviewStep = [...screen.getByLabelText('Agent progress').querySelectorAll('li')]
  .find(step => step.textContent?.includes('Run / review'))
expect(runReviewStep?.classList.contains('done')).to.equal(true)
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "completed Act run"
```

Expected: fail because the UI still says `Act: ready` and marks `Run / review` active.

- [x] **Step 3: Implement semantics**

Update:

```ts
function getStartActHint(session, t) {
  if (session?.mode === 'act' && session.status === 'completed') {
    return t('ai_assistant_start_act_hint_completed')
  }
  ...
}

function getAgentProgressSteps(session, t) {
  const actCompleted = session?.mode === 'act' && session.status === 'completed'
  ...
  { key: 'run-review', state: actCompleted ? 'done' : isActMode ? 'active' : 'pending' }
}

function formatAgentMode(session, t) {
  if (session.mode === 'act' && session.status === 'completed') {
    return t('ai_assistant_act_completed')
  }
  ...
}
```

Add translations:

```json
"ai_assistant_act_completed": "Act: completed",
"ai_assistant_start_act_hint_completed": "Last Act run completed. Edit the prompt or press Run to continue."
```

zh-CN:

```json
"ai_assistant_act_completed": "执行：已完成",
"ai_assistant_start_act_hint_completed": "上一次执行已完成。可修改提示词，或点击“执行”继续。"
```

- [x] **Step 4: Verify green**

Run the same grep test. Expected: pass.

## Task 2: Long Agent Result Folding

**Files:**
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/frontend/stylesheets/pages/editor/ai-assistant.scss`
- Modify: `services/web/locales/en.json`
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/frontend/extracted-translations.json`

- [x] **Step 1: Write failing test**

Add a helper `mockAgentTurnStreamWithLongResult()` that returns a long answer with visible first lines and hidden tail text. Add a test:

```ts
await screen.findByText('Result')
screen.getByText(/Visible result opening/)
expect(screen.queryByText(/Hidden result tail/)).to.equal(null)
fireEvent.click(screen.getByRole('button', { name: 'Show full result' }))
screen.getByText(/Hidden result tail/)
fireEvent.click(screen.getByRole('button', { name: 'Collapse result' }))
expect(screen.queryByText(/Hidden result tail/)).to.equal(null)
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "collapses long Agent results"
```

Expected: fail because the tail is always rendered and no toggle exists.

- [x] **Step 3: Implement folding**

Change `AgentResult` to:

- Detect long answers with `isLongAgentAnswer(answer)`.
- Render a preview from `getAgentAnswerPreview(answer)` while collapsed.
- Show an `OLButton` with `Show full result` / `Collapse result`.
- Keep short answers unchanged.

Constants:

```ts
const AGENT_RESULT_PREVIEW_CHARS = 900
const AGENT_RESULT_PREVIEW_LINES = 12
```

Translations:

```json
"ai_assistant_show_full_result": "Show full result",
"ai_assistant_collapse_result": "Collapse result"
```

zh-CN:

```json
"ai_assistant_show_full_result": "展开完整结果",
"ai_assistant_collapse_result": "收起结果"
```

- [x] **Step 4: Verify green**

Run the same grep test. Expected: pass.

## Task 3: Work Log Default De-Cluttering

**Files:**
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/scripts/ai_agent_cline_browser_smoke.mjs`

- [x] **Step 1: Write failing test**

In the run-summary test, after `await screen.findByText('Run summary')`, assert:

```ts
const worklog = screen.getByText('Work log').closest('details')
expect(worklog?.open).to.equal(false)
```

Also add a focused test for a run without summary:

```ts
await screen.findByText('Work log')
expect(screen.getByText('Work log').closest('details')?.open).to.equal(true)
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "Work log"
```

Expected: fail because Work log is always open.

- [x] **Step 3: Implement default state**

Change:

```tsx
<details className="ai-assistant-agent-events" open>
```

to:

```tsx
<details className="ai-assistant-agent-events" open={!runSummary}>
```

Update the browser smoke so it opens `Work log` before checking hidden runtime details when needed:

```js
await page.getByText('Work log', { exact: true }).click()
```

- [x] **Step 4: Verify green**

Run the grep test. Expected: pass.

## Task 4: Chinese Runtime Copy Cleanup

**Files:**
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`

- [x] **Step 1: Write failing test**

Add a locale-level assertion test or extend an existing rendering test with temporary Chinese i18n state to assert:

```ts
screen.getByText('插件：latex-core')
screen.getByText('技能：latex-compile-debug')
screen.getByText('子 Agent：已禁用')
```

- [x] **Step 2: Verify red**

Expected: fail because zh-CN currently says `Plugins`, `Skills`, and `Subagents`.

- [x] **Step 3: Update translations**

Change:

```json
"ai_assistant_plugins_summary": "插件：__plugins__",
"ai_assistant_skills_summary": "技能：__skills__",
"ai_assistant_subagents_summary": "子 Agent：__state__"
```

- [x] **Step 4: Verify green**

Run the focused locale test. Expected: pass.

## Task 5: Verification

- [x] **Step 1: Run full AI Assistant frontend tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

- [x] **Step 2: Run smoke helper tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs
```

- [x] **Step 3: Run targeted lint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx frontend/stylesheets/pages/editor/ai-assistant.scss scripts/ai_agent_cline_browser_smoke.mjs
```

- [x] **Step 4: Run real browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 5: Run whitespace check**

```bash
git diff --check
```

## Verification Evidence

- Focused Agent UX tests passed during implementation: `5 passing`.
- Full AI Assistant frontend test passed: `30 passing`.
- Smoke helper tests passed: `5 passing`.
- Targeted JS/TS ESLint passed after excluding SCSS from ESLint and checking SCSS with stylelint.
- Stylelint passed for `frontend/stylesheets/pages/editor/ai-assistant.scss`.
- Real browser Cline Agent smoke passed with the root channel provider and saved screenshot: `output/playwright/superpaper-cline-browser-smoke-2026-05-25T04-25-06-589Z.png`.
- Whitespace check passed: `git diff --check`.

## Follow-Up Notes

- The first real browser smoke attempt failed because the rendered compile diagnostic label was uppercase (`FIRST COMPILER ERROR`) while the smoke assertion expected title case. The assertion now matches case-insensitively while still requiring the real `pdflatex: gave an error` diagnostic.
- The browser smoke continues to use the real root-channel provider and project credentials supplied outside the script; no mock provider path is used in this verification.
