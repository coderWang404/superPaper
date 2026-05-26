# Agent Workbench Dashboard and zh Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Agent rail read as a compact workbench by turning Run summary into a dashboard, making Work log explicitly secondary, and adding zh-CN real-browser smoke coverage.

**Architecture:** Keep the Agent runtime and backend untouched. Add presentational helpers inside `AiAssistantPanel`, scoped SCSS for a denser dashboard header, locale keys for explicit status copy, and browser-smoke config flags for language-sensitive assertions.

**Tech Stack:** React/TypeScript, i18next locale JSON, SCSS, Mocha frontend tests, Playwright smoke script.

---

## Current Findings

- Run summary currently shows useful before/after commit and diff metrics, but it reads as a card of raw artifacts rather than a current-run dashboard.
- Work log is collapsed when a Run summary exists, but the collapsed row still looks like a peer section instead of a secondary audit trail.
- Real browser smoke covers the root-channel Agent path in English only. zh-CN copy changes are protected by unit/frontend tests, but not by a real browser smoke path.

## Task 1: Run Summary Dashboard Header

**Files:**
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/frontend/stylesheets/pages/editor/ai-assistant.scss`
- Modify: `services/web/locales/en.json`
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/frontend/extracted-translations.json`

- [x] **Step 1: Write failing test**

Add assertions to the existing run-summary test:

```ts
const summary = await screen.findByRole('region', { name: 'Run summary' })
expect(summary.textContent).to.contain('Run completed')
expect(summary.textContent).to.contain('Workspace impact')
expect(summary.textContent).to.contain('Review or roll back before continuing.')
expect(summary.querySelectorAll('.ai-assistant-agent-run-summary-stat')).to.have.length(3)
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "readable run summary"
```

Expected: fail because the status headline, impact label, guidance text, and stat class do not exist yet.

- [x] **Step 3: Implement dashboard header**

Inside `AgentRunSummary`, add:

```tsx
<div className="ai-assistant-agent-run-summary-overview">
  <div>
    <span className="ai-assistant-agent-run-summary-eyebrow">
      {t('ai_assistant_run_summary_status')}
    </span>
    <strong>{t('ai_assistant_run_summary_completed')}</strong>
  </div>
  <p>{t('ai_assistant_run_summary_guidance')}</p>
</div>
```

Rename metric class from `ai-assistant-agent-run-summary-metric` to also include `ai-assistant-agent-run-summary-stat`.

Add translations:

```json
"ai_assistant_run_summary_status": "Run status",
"ai_assistant_run_summary_completed": "Run completed",
"ai_assistant_run_summary_guidance": "Review or roll back before continuing.",
"ai_assistant_run_summary_impact": "Workspace impact"
```

zh-CN:

```json
"ai_assistant_run_summary_status": "运行状态",
"ai_assistant_run_summary_completed": "运行已完成",
"ai_assistant_run_summary_guidance": "继续前可先复核，必要时回滚。",
"ai_assistant_run_summary_impact": "工作区影响"
```

- [x] **Step 4: Verify green**

Run the same grep test. Expected: pass.

## Task 2: Work Log Secondary Audit Trail

**Files:**
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/frontend/stylesheets/pages/editor/ai-assistant.scss`
- Modify: `services/web/locales/en.json`
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/frontend/extracted-translations.json`
- Modify: `services/web/scripts/ai_agent_cline_browser_smoke.mjs`

- [x] **Step 1: Write failing test**

Extend the run-summary test:

```ts
const worklog = screen.getByText('Detailed work log').closest('details')
expect(worklog?.open).to.equal(false)
screen.getByText('Audit trail')
screen.getByText('Open only when you need raw runtime details.')
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "readable run summary"
```

Expected: fail because the Work log labels are still generic.

- [x] **Step 3: Implement secondary summary copy**

In `AgentEventList`, when `runSummary` exists, render:

```tsx
<span>{t('ai_assistant_agent_worklog_detailed')}</span>
<span className="ai-assistant-agent-events-purpose">
  {t('ai_assistant_agent_worklog_audit_trail')}
</span>
...
<p className="ai-assistant-agent-events-hint">
  {t('ai_assistant_agent_worklog_secondary_hint')}
</p>
```

Keep the old `Work log` label when no `runSummary` exists.

Translations:

```json
"ai_assistant_agent_worklog_detailed": "Detailed work log",
"ai_assistant_agent_worklog_audit_trail": "Audit trail",
"ai_assistant_agent_worklog_secondary_hint": "Open only when you need raw runtime details."
```

zh-CN:

```json
"ai_assistant_agent_worklog_detailed": "详细工作日志",
"ai_assistant_agent_worklog_audit_trail": "审计轨迹",
"ai_assistant_agent_worklog_secondary_hint": "仅在需要查看原始运行细节时展开。"
```

Update browser smoke to click either `Detailed work log` or `Work log`.

- [x] **Step 4: Verify green**

Run the same grep test. Expected: pass.

## Task 3: zh-CN Real Browser Smoke Mode

**Files:**
- Modify: `services/web/test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs`
- Modify: `services/web/scripts/ai_agent_cline_browser_smoke_config.mjs`
- Modify: `services/web/scripts/ai_agent_cline_browser_smoke.mjs`

- [x] **Step 1: Write failing config test**

Add a test:

```js
const config = buildClineBrowserSmokeConfig({
  SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
  SUPERPAPER_SMOKE_PASSWORD: 'secret',
  SUPERPAPER_SMOKE_PROJECT_ID: 'project-one',
  SUPERPAPER_SMOKE_LOCALE: 'zh-CN',
})
expect(config.locale).to.equal('zh-CN')
expect(config.expected.runSummary).to.equal('运行摘要')
expect(config.expected.detailedWorklog).to.equal('详细工作日志')
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs --grep "locale"
```

Expected: fail because locale-specific expected text is not part of config.

- [x] **Step 3: Implement locale config**

Add `locale` and `expected` to config:

```js
const LOCALE_EXPECTATIONS = {
  en: {
    runSummary: 'Run summary',
    detailedWorklog: 'Detailed work log',
    clineRuntime: 'Cline runtime',
    actCompleted: 'Act: completed',
  },
  'zh-CN': {
    runSummary: '运行摘要',
    detailedWorklog: '详细工作日志',
    clineRuntime: 'Cline runtime',
    actCompleted: '执行：已完成',
  },
}
```

Normalize unknown locales to `en`.

- [x] **Step 4: Update smoke assertions**

In `runAgentSmoke`, replace hard-coded text for run summary, worklog, completed state, rail labels, runtime policy copy, and compile-diagnostic handoff with `config.expected.*`. Configure non-English browser runs through the server language cookie before first navigation:

```js
await page.context().addCookies([
  {
    name: config.languageCookieName,
    value: config.locale,
    url: config.baseUrl,
  },
])
```

- [x] **Step 5: Verify green**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs
```

Expected: pass.

## Task 4: Verification

- [x] **Step 1: Full AI Assistant frontend tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

- [x] **Step 2: Smoke helper tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs
```

- [x] **Step 3: Targeted lint and stylelint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx scripts/ai_agent_cline_browser_smoke.mjs scripts/ai_agent_cline_browser_smoke_config.mjs
../../node_modules/.bin/stylelint frontend/stylesheets/pages/editor/ai-assistant.scss
```

- [x] **Step 4: English real browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 5: zh-CN real browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' SUPERPAPER_SMOKE_LOCALE='zh-CN' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 6: Whitespace check**

```bash
git diff --check
```

## Verification Evidence

- Frontend AI Assistant component suite: `30 passing`.
- Smoke helper/config unit suite: `7 passing`.
- Targeted eslint: clean.
- Targeted stylelint: clean.
- English real browser smoke: passed, screenshot `output/playwright/superpaper-cline-browser-smoke-2026-05-25T05-31-16-035Z.png`.
- zh-CN real browser smoke: passed, screenshot `output/playwright/superpaper-cline-browser-smoke-2026-05-25T05-30-12-592Z.png`.
- Whitespace check: `git diff --check` clean.

## Debug Notes

- `lng=zh-CN` query parameters do not drive the editor language. The server renders `ol-i18n` from `superpaper_lang`, so the smoke script now writes the language cookie before login/project navigation.
- zh-CN login and editor rails exposed hidden/translated submit and tab controls. The smoke script now prefers stable DOM targets where available and uses locale-specific visible labels for user-facing assertions.
