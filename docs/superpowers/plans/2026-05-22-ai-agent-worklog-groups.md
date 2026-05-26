# AI Agent Worklog Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Agent worklog easier to scan by grouping readable runtime events into context, tool, workspace, and update sections while preserving the existing checkpoint/diff cards.

**Architecture:** Keep the Cline runtime and event contract unchanged. Add a small pure grouping helper in `ai-assistant-panel.tsx`, render grouped sections inside the existing Work log details block, and style them as compact operational rows that fit the narrow Overleaf rail.

**Tech Stack:** React/TypeScript, SCSS, i18next locale JSON, Mocha frontend tests, Playwright smoke script.

---

## File Structure

- Modify `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
  - Add `AgentWorklogGroup` types and `buildAgentWorklogGroups`.
  - Render grouped sections inside `AgentEventList`.
  - Keep `AgentCheckpointCard` and `AgentWorkspaceDiffCard` as dedicated artifact cards.
- Modify `services/web/frontend/stylesheets/pages/editor/ai-assistant.scss`
  - Add compact group headers and grouped body spacing.
- Modify `services/web/locales/en.json`, `services/web/locales/zh-CN.json`, and `services/web/frontend/extracted-translations.json`
  - Add group labels and group count labels.
- Modify `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
  - Add a failing assertion that readable Cline telemetry is grouped into Workspace and Tools.
- Modify `services/web/scripts/ai_agent_cline_browser_smoke.mjs`
  - Assert the settled browser view does not expose raw `ai_assistant_` translation keys.

## Task 1: Worklog Grouping Test

- [x] **Step 1: Write the failing frontend test**

Add assertions to the existing `filters raw Cline telemetry out of the readable agent worklog` test:

```ts
screen.getByText('Workspace')
screen.getByText('Tools')
screen.getByText('2 events')
screen.getByText('Checkpoint')
screen.getByText('Tool call: run_commands')
screen.getByText('Tool result: run_commands')
```

- [x] **Step 2: Run red frontend test**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "filters raw Cline telemetry"
```

Expected: fail because `Workspace` and `Tools` group headers do not exist yet.

## Task 2: Grouped Worklog UI

- [x] **Step 1: Implement grouping helper**

Add these concepts near the existing worklog helpers:

```ts
type AgentWorklogGroupKey = 'context' | 'tools' | 'workspace' | 'updates'

type AgentWorklogGroup = {
  key: AgentWorklogGroupKey
  labelKey: string
  events: ProjectAiAgentEvent[]
}
```

Group by event type:

```ts
checkpoint_created, checkpoint_restored, workspace_diff, patch_applied, patch_rolled_back -> workspace
tool_call, tool_result, permission_denied -> tools
message with kind context/plan or Cline runtime context, mode_changed -> context
error and remaining readable events -> updates
```

- [x] **Step 2: Render group sections**

Inside `AgentEventList`, replace the flat `worklogEvents.map` body with `worklogGroups.map`. Each group renders a header with label and `ai_assistant_agent_worklog_group_count`, then maps its events through the same card/details rendering currently used by the flat list.

- [x] **Step 3: Add styles**

Add `.ai-assistant-agent-event-group`, `.ai-assistant-agent-event-group-header`, `.ai-assistant-agent-event-group-count`, and `.ai-assistant-agent-event-group-body`. The visual treatment should be dense, neutral, and nested inside the existing Work log card.

- [x] **Step 4: Add translations**

English:

```json
"ai_assistant_agent_worklog_group_context": "Context",
"ai_assistant_agent_worklog_group_tools": "Tools",
"ai_assistant_agent_worklog_group_workspace": "Workspace",
"ai_assistant_agent_worklog_group_updates": "Updates",
"ai_assistant_agent_worklog_group_count": "__count__ event",
"ai_assistant_agent_worklog_group_count_plural": "__count__ events"
```

Chinese:

```json
"ai_assistant_agent_worklog_group_context": "上下文",
"ai_assistant_agent_worklog_group_tools": "工具",
"ai_assistant_agent_worklog_group_workspace": "工作区",
"ai_assistant_agent_worklog_group_updates": "更新",
"ai_assistant_agent_worklog_group_count": "__count__ 条事件",
"ai_assistant_agent_worklog_group_count_plural": "__count__ 条事件"
```

- [x] **Step 5: Run green frontend test**

Run the same Mocha command from Task 1. Expected: pass.

## Task 3: Browser Smoke Translation Guard

- [x] **Step 1: Add raw key assertion**

In `ai_agent_cline_browser_smoke.mjs`, after `waitForComposerSubmitIdle(page)`, inspect visible body text and throw if it contains `ai_assistant_`.

- [x] **Step 2: Run targeted lint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx scripts/ai_agent_cline_browser_smoke.mjs
```

Expected: exit 0.

## Task 4: Verification

- [x] **Step 1: Run focused frontend bundle**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "worklog|runtime context|Cline checkpoints"
```

- [x] **Step 2: Run real browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 3: Run whitespace check**

```bash
git diff --check
```

## Verification Results

- Red frontend test: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "filters raw Cline telemetry"` -> failed on missing `Workspace`.
- Green frontend test: same command -> 1 passing.
- Focused frontend bundle: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "worklog|runtime context|Cline checkpoints"` -> 3 passing.
- Targeted lint: `node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx scripts/ai_agent_cline_browser_smoke.mjs` -> passed.
- Whitespace check: `git diff --check` -> passed.
- Real browser smoke:

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

Result: passed. Screenshot: `output/playwright/superpaper-cline-browser-smoke-2026-05-22T01-34-10-588Z.png`.
