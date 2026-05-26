# AI Agent Workbench Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI Agent rail easier to trust and scan by adding a status/capability overview and tightening the real Cline browser smoke completion gate.

**Architecture:** Keep the existing single-agent Cline runtime unchanged. Add pure frontend formatting helpers and presentational UI inside `AgentRunControls`, then strengthen the Playwright smoke runner to wait for settled UI evidence before saving screenshots.

**Tech Stack:** React/TypeScript, SCSS, Mocha frontend tests, Playwright smoke script, existing i18next locale files.

---

## File Structure

- Modify `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
  - Pass `agentConfig` to `AgentRunControls`.
  - Render an Agent status overview and capability strip.
  - Add pure helpers for status label/tone and capability items.
- Modify `services/web/frontend/stylesheets/pages/editor/ai-assistant.scss`
  - Style the overview as a compact operational status band.
  - Keep typography small and scannable.
- Modify `services/web/locales/en.json` and `services/web/locales/zh-CN.json`
  - Add status and capability labels.
- Modify `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
  - Add regression coverage for the status overview and capability strip.
- Modify `services/web/scripts/ai_agent_cline_browser_smoke.mjs`
  - Wait for the Agent result and for the composer submit button to become idle before saving the screenshot.

## Task 1: Status And Capability UI

- [x] **Step 1: Write failing frontend test**

Add a test to `ai-assistant-panel.test.tsx` named `summarizes the current agent run and capabilities`.

Expected behavior:

```ts
screen.getByText('Current run')
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
screen.getByText('Explain the project structure.')
```

- [x] **Step 2: Run red frontend test**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "summarizes the current agent run"
```

Expected: fail because the overview does not exist.

- [x] **Step 3: Implement frontend UI**

Implement `AgentStatusOverview`, `getAgentStatusLabel`, `getAgentStatusTone`, and `getAgentCapabilityItems`. Render it before the existing Plan/Start Act/Run progress list.

- [x] **Step 4: Run green frontend test**

Run the same Mocha command. Expected: 1 passing.

## Task 2: Smoke Completion Gate

- [x] **Step 1: Strengthen smoke wait**

In `ai_agent_cline_browser_smoke.mjs`, after the runtime/checkpoint assertions:

- wait for `Result` to be visible.
- wait until the composer submit button has `data-ol-loading="false"` and is not disabled.

- [x] **Step 2: Run real browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

Expected: exits 0 after the agent turn settles and saves a screenshot under `output/playwright/`.

## Task 3: Verification

- [x] **Step 1: Run focused frontend test**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "summarizes the current agent run|shows Agent mode progress|runtime context|Cline checkpoints"
```

- [x] **Step 2: Run targeted lint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx scripts/ai_agent_cline_browser_smoke.mjs
```

- [x] **Step 3: Run diff check**

```bash
git diff --check
```

## Current Status

Implemented on 2026-05-22. The Agent controls now render a compact current-run status band, the active task, and capability chips for direct project edits, checkpoint rollback, external tools, and enabled skills. The smoke runner now waits for the final Result block and for the composer submit button to stop loading before saving evidence.

## Verification Results

- Red frontend test: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "summarizes the current agent run"` -> failed because `Current run` did not exist.
- Green frontend test: same command -> 1 passing.
- Focused frontend bundle: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "summarizes the current agent run|shows Agent mode progress|runtime context|Cline checkpoints"` -> 4 passing.
- Targeted lint: `node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx scripts/ai_agent_cline_browser_smoke.mjs` -> passed.
- Whitespace check: `git diff --check` -> passed.
- Real browser smoke first exposed two polish regressions:
  - New translation keys rendered as raw i18n keys until `frontend/extracted-translations.json` was updated.
  - Capability Material ligatures rendered as text, so capability chips now use CSS status dots.
- Real browser smoke after fixes:

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

Result: passed. Screenshot: `output/playwright/superpaper-cline-browser-smoke-2026-05-22T00-41-54-500Z.png`.
