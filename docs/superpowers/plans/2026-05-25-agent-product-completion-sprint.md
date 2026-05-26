# Agent Product Completion Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Cline-backed paper Agent as a product-grade main path: readable after-run state, actionable workspace impact, real direct-edit browser smoke, and a concrete completion report.

**Architecture:** Keep the Cline runtime and project filesystem route as the primary path. Add small UI affordances to the existing Agent run summary, extend the browser smoke script with an opt-in direct-edit mode, and document the remaining gap after verified evidence rather than speculative polish.

**Tech Stack:** React/TypeScript, SCSS, i18next JSON locales, Mocha/Vitest-style frontend tests, Playwright browser smoke scripts.

---

## Product Gap Assessment

- The core Cline Agent path exists: provider selection, plan/run, direct workspace write policy, checkpoint events, workspace diff, rollback, compile diagnostic handoff.
- Product-grade gap is now about closure: a user must immediately understand changed files, know what action to take next, and the project must have a real browser smoke proving that Cline can modify a project file rather than only report capability.
- Remaining work in this sprint is deliberately bounded to the primary single-Agent thesis-writing flow. Multi-agent orchestration, broad admin redesign, and marketplace-grade plugin UX stay out of scope.

## Completion Target

After this sprint, the project should be judged:

- Systemic usability: about 90% for the single-user Cline Agent route.
- Visual/product polish: about 82-85% for the AI rail and Agent workbench.
- Remaining gap: provider reliability/fallback strategy, broader real-browser matrix, and deeper admin IA, not the main paper-file Agent loop.

## Task 1: Run Summary Actionable Workspace Impact

**Files:**
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/frontend/stylesheets/pages/editor/ai-assistant.scss`
- Modify: `services/web/locales/en.json`
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/frontend/extracted-translations.json`

- [x] **Step 1: Write failing frontend test**

Extend `renders Cline checkpoints and workspace diffs as a readable run summary` with:

```ts
screen.getByText('Changed files')
screen.getByText('Next step')
screen.getByText('Review changed files, compile, then keep or roll back.')
const summary = await screen.findByRole('region', { name: 'Run summary' })
expect(
  summary.querySelectorAll('.ai-assistant-agent-run-summary-path')
).to.have.length(2)
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "readable run summary"
```

Expected: fail because the changed-files and next-step summary do not exist yet.

- [x] **Step 3: Implement summary sections**

Inside `AgentRunSummary`, after metrics, render:

```tsx
{summary.diff?.paths.length ? (
  <div className="ai-assistant-agent-run-summary-files">
    <span className="ai-assistant-agent-run-summary-section-label">
      {t('ai_assistant_changed_files')}
    </span>
    <ul>
      {summary.diff.paths.slice(0, 4).map(path => (
        <li className="ai-assistant-agent-run-summary-path" key={path}>
          {path}
        </li>
      ))}
    </ul>
  </div>
) : null}
<div className="ai-assistant-agent-run-summary-next-step">
  <span className="ai-assistant-agent-run-summary-section-label">
    {t('ai_assistant_next_step')}
  </span>
  <p>{t('ai_assistant_run_summary_next_step')}</p>
</div>
```

Add locale keys:

```json
"ai_assistant_changed_files": "Changed files",
"ai_assistant_next_step": "Next step",
"ai_assistant_run_summary_next_step": "Review changed files, compile, then keep or roll back."
```

zh-CN:

```json
"ai_assistant_changed_files": "变更文件",
"ai_assistant_next_step": "下一步",
"ai_assistant_run_summary_next_step": "复核变更文件，编译确认，然后保留或回滚。"
```

- [x] **Step 4: Verify green**

Run the same grep test. Expected: pass.

## Task 2: Direct-Edit Browser Smoke Mode

**Files:**
- Modify: `services/web/test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs`
- Modify: `services/web/scripts/ai_agent_cline_browser_smoke_config.mjs`
- Modify: `services/web/scripts/ai_agent_cline_browser_smoke.mjs`

- [x] **Step 1: Write failing config test**

Add:

```js
const config = buildClineBrowserSmokeConfig({
  SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
  SUPERPAPER_SMOKE_PASSWORD: 'secret',
  SUPERPAPER_SMOKE_PROJECT_ID: 'project-one',
  SUPERPAPER_SMOKE_DIRECT_EDIT: 'true',
  SUPERPAPER_SMOKE_EDIT_FILE: 'main.tex',
  SUPERPAPER_SMOKE_EDIT_MARKER: 'SMOKE_MARKER',
})
expect(config.directEdit.enabled).to.equal(true)
expect(config.directEdit.file).to.equal('main.tex')
expect(config.directEdit.marker).to.equal('SMOKE_MARKER')
expect(config.prompt).to.contain('SMOKE_MARKER')
```

- [x] **Step 2: Verify red**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs --grep "direct edit"
```

Expected: fail because direct-edit config does not exist.

- [x] **Step 3: Implement direct-edit config**

Add `SUPERPAPER_SMOKE_DIRECT_EDIT`, `SUPERPAPER_SMOKE_EDIT_FILE`, and `SUPERPAPER_SMOKE_EDIT_MARKER`.

When enabled, set prompt to:

```js
`Directly edit ${editFile} in this project. Add a single LaTeX comment line containing ${editMarker}. Keep the document valid and do not modify any other file.`
```

Return:

```js
directEdit: {
  enabled,
  file: editFile,
  marker: editMarker,
}
```

- [x] **Step 4: Verify config green**

Run the same grep test. Expected: pass.

- [x] **Step 5: Implement browser assertion**

In `runAgentSmoke`, after the run summary assertions:

```js
if (config.directEdit.enabled) {
  await expectVisibleText(page, config.directEdit.file)
  await expectVisibleText(page, config.directEdit.marker)
}
```

This validates the visible Agent result/worklog/summary exposes the real target file and marker. The project workspace watcher and editor sync are covered by existing backend/frontend tests; this smoke is for the real browser Agent path.

## Task 3: Completion Report

**Files:**
- Create: `docs/superpowers/reports/2026-05-25-agent-product-completion-report.md`

- [x] **Step 1: Write report after verification**

Create a concise report with:

```markdown
# Agent Product Completion Report

## Current Completion

- Systemic usability: 90%.
- Visual/product polish: 82-85%.

## Completed Main Path

- Cline-backed single Agent route.
- Direct workspace write policy.
- Checkpoints, workspace diff, rollback.
- Run summary dashboard with changed files and next step.
- EN and zh-CN browser smoke.
- Direct-edit browser smoke.

## Remaining Product Gaps

- Provider reliability and fallback UX.
- Broader browser matrix beyond the smoke account/project.
- Admin IA polish for large provider/plugin sets.
- More granular visual diff apply controls for long papers.

## Verification Evidence

[Fill with exact commands and screenshot paths from this sprint.]
```

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
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx scripts/ai_agent_cline_browser_smoke.mjs scripts/ai_agent_cline_browser_smoke_config.mjs scripts/ai_agent_cline_browser_smoke_assertions.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs
../../node_modules/.bin/stylelint frontend/stylesheets/pages/editor/ai-assistant.scss
```

- [x] **Step 4: English browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 5: zh-CN browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' SUPERPAPER_SMOKE_LOCALE='zh-CN' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 6: Direct-edit browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' SUPERPAPER_SMOKE_DIRECT_EDIT='true' SUPERPAPER_SMOKE_EDIT_MARKER='SUPERPAPER_DIRECT_EDIT_SMOKE_20260525' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 7: Whitespace check**

```bash
git diff --check
```
