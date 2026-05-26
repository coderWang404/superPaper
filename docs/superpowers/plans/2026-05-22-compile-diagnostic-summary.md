# Compile Diagnostic Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make failed PDF compiles immediately actionable by showing the first parsed compiler diagnostic beside the existing No PDF explanation.

**Architecture:** Keep the compile response contract, log parser, and logs tabs unchanged. Add a small presentational summary inside `ErrorLogs` that appears only when `error === 'failure'` and at least one parsed error exists.

**Tech Stack:** React/TypeScript, i18next locale JSON, existing PDF preview log components, Mocha frontend tests.

---

## File Structure

- Modify `services/web/frontend/js/features/pdf-preview/components/error-logs.tsx`
  - Derive the first parsed error from `logEntries.errors`.
  - Render a compact diagnostic card before the generic No PDF error.
  - Include file/line when available.
- Modify `services/web/frontend/stylesheets/pages/editor/logs.scss`
  - Add neutral, compact styles for the diagnostic summary.
- Modify `services/web/locales/en.json`, `services/web/locales/zh-CN.json`, and `services/web/frontend/extracted-translations.json`
  - Add labels for the diagnostic summary.
- Create `services/web/test/frontend/features/pdf-preview/components/error-logs.test.tsx`
  - Render `ErrorLogs` with a mocked compile context.
  - Assert failure status displays the first diagnostic and the source location.

## Task 1: Failing Test

- [x] **Step 1: Add a test for first diagnostic visibility**

Create a Mocha frontend test that provides:

```ts
error: 'failure',
logEntries: {
  all: [firstError],
  errors: [firstError],
  warnings: [],
  typesetting: [],
}
```

Assert visible text:

```ts
screen.getByText('First compiler error')
screen.getByText('main.tex:14')
screen.getAllByText('pdflatex: gave an error')
screen.getByText('Fix this first, then recompile. Later errors may be cascading symptoms.')
```

- [x] **Step 2: Run the red test**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/pdf-preview/components/error-logs.test.tsx --grep "shows the first compiler diagnostic"
```

Expected: fail because the summary card does not exist.

## Task 2: Implementation

- [x] **Step 1: Render the summary card**

In `ErrorLogs`, compute:

```ts
const firstError = logEntries?.errors?.[0]
```

Render a new `FirstCompilerErrorSummary` before `<PdfPreviewError error={error} />` when `error === 'failure' && firstError`.

- [x] **Step 2: Add summary formatting helper**

Show source as `file:line` if both exist, file only if no line, otherwise omit source. Use `firstError.messageComponent ?? firstError.message` as the title text.

- [x] **Step 3: Add styles**

Style `.first-compiler-error-summary` as a compact bordered block inside the logs pane. Avoid nested cards; keep it visually closer to an alert row.

- [x] **Step 4: Add translations**

English:

```json
"first_compiler_error": "First compiler error",
"first_compiler_error_guidance": "Fix this first, then recompile. Later errors may be cascading symptoms."
```

Chinese:

```json
"first_compiler_error": "第一个编译错误",
"first_compiler_error_guidance": "先修复这里再重新编译。后面的错误可能只是连锁症状。"
```

- [x] **Step 5: Run the green test**

Run the same Mocha command. Expected: pass.

## Task 3: Verification

- [x] **Step 1: Run related frontend tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/pdf-preview/components/error-logs.test.tsx test/frontend/features/pdf-preview/util/output-files.test.ts
```

- [x] **Step 2: Run targeted lint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/pdf-preview/components/error-logs.tsx test/frontend/features/pdf-preview/components/error-logs.test.tsx frontend/js/features/pdf-preview/util/output-files.ts test/frontend/features/pdf-preview/util/output-files.test.ts
```

- [x] **Step 3: Run whitespace check**

```bash
git diff --check
```

## Verification Results

- Red frontend test: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/pdf-preview/components/error-logs.test.tsx --grep "shows the first compiler diagnostic"` -> failed on missing `First compiler error`.
- Green frontend test: same command -> 1 passing.
- Related frontend tests: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/pdf-preview/components/error-logs.test.tsx test/frontend/features/pdf-preview/util/output-files.test.ts` -> 2 passing.
- Targeted lint: `node ../../node_modules/eslint/bin/eslint.js frontend/js/features/pdf-preview/components/error-logs.tsx test/frontend/features/pdf-preview/components/error-logs.test.tsx frontend/js/features/pdf-preview/util/output-files.ts test/frontend/features/pdf-preview/util/output-files.test.ts` -> passed.
- Whitespace check: `git diff --check` -> passed.
- Real browser smoke:

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

Result: passed. Screenshot: `output/playwright/superpaper-cline-browser-smoke-2026-05-22T01-53-43-243Z.png`.
