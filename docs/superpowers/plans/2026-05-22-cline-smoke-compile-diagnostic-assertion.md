# Cline Smoke Compile Diagnostic Assertion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real Cline browser smoke fail if the PDF logs regress to a generic No PDF view without the first compiler diagnostic summary.

**Architecture:** Extract small smoke assertion helpers from `ai_agent_cline_browser_smoke.mjs` into a testable module. Keep the Playwright flow unchanged, then call the new compile diagnostic assertion after the Agent turn settles.

**Tech Stack:** Node ESM scripts, Vitest unit tests, Playwright browser smoke.

---

## File Structure

- Create `services/web/scripts/ai_agent_cline_browser_smoke_assertions.mjs`
  - Export `assertNoVisibleRawTranslationKeys`.
  - Export `assertVisibleCompileDiagnostic`.
- Modify `services/web/scripts/ai_agent_cline_browser_smoke.mjs`
  - Import the assertion helpers.
  - Remove the inline raw translation key helper.
  - Call `assertVisibleCompileDiagnostic(page)` before screenshot capture.
- Create `services/web/test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs`
  - Test the new helpers with a fake Playwright page.

## Task 1: Failing Test

- [x] **Step 1: Write the failing unit test**

Create `AiAgentClineBrowserSmokeAssertions.test.mjs` with:

```js
await assertVisibleCompileDiagnostic(makePage('First compiler error\npdflatex: gave an error'))
await expect(() => assertVisibleCompileDiagnostic(makePage('No PDF'))).rejects.toThrow('First compiler error')
await expect(() => assertNoVisibleRawTranslationKeys(makePage('ai_assistant_missing_key'))).rejects.toThrow('ai_assistant_missing_key')
```

- [x] **Step 2: Run red unit test**

```bash
cd services/web
../../node_modules/.bin/vitest run test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs
```

Expected: fail because the assertion module does not exist yet.

## Task 2: Assertion Module

- [x] **Step 1: Create assertion module**

Implement helpers using existing Playwright-like APIs:

```js
export async function assertVisibleCompileDiagnostic(page) {
  await expectVisibleText(page, 'First compiler error')
  await expectVisibleText(page, 'pdflatex: gave an error')
}
```

- [x] **Step 2: Import helpers in smoke script**

Use:

```js
import {
  assertNoVisibleRawTranslationKeys,
  assertVisibleCompileDiagnostic,
} from './ai_agent_cline_browser_smoke_assertions.mjs'
```

Call `assertVisibleCompileDiagnostic(page)` after `waitForComposerSubmitIdle(page)`.

- [x] **Step 3: Run green unit test**

Run the same Vitest command. Expected: pass.

## Task 3: Verification

- [x] **Step 1: Run targeted lint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js scripts/ai_agent_cline_browser_smoke.mjs scripts/ai_agent_cline_browser_smoke_assertions.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs
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

- Red unit test: `../../node_modules/.bin/vitest run test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs` -> failed because `ai_agent_cline_browser_smoke_assertions.mjs` did not exist.
- Green unit test: same command -> 2 passing.
- Targeted lint: `node ../../node_modules/eslint/bin/eslint.js scripts/ai_agent_cline_browser_smoke.mjs scripts/ai_agent_cline_browser_smoke_assertions.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeAssertions.test.mjs` -> passed.
- Whitespace check: `git diff --check` -> passed.
- Real browser smoke:

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

Result: passed with hard assertions for `First compiler error` and `pdflatex: gave an error`. Screenshot: `output/playwright/superpaper-cline-browser-smoke-2026-05-22T02-05-50-627Z.png`.
