# Compile Error To Agent Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn compile diagnostics into an actionable Agent workflow by letting users send the first compiler error directly into the AI Assistant Agent composer.

**Architecture:** Keep PDF logs and AI Assistant independent. Add a tiny shared prefill utility that writes a project-scoped pending prompt and dispatches a browser event; the PDF error card publishes the prompt and opens the AI Assistant rail tab; the AI Assistant consumes the pending prompt on mount or via event.

**Tech Stack:** React/TypeScript, browser CustomEvent, localStorage, Mocha frontend tests, existing Overleaf-style rail tab event.

---

## Current Distance Review

- Core Cline runtime: about 80 percent. Direct project-file editing, Cline SDK path, real provider smoke, checkpoints, diffs, rollback, and workspace refresh exist.
- Trust/recovery: about 75 percent. Checkpoint and diff visibility is now strong; rollback exists; smoke locks key regressions. Remaining gap: clearer “what will happen if I click this” affordances around destructive edits.
- Compile diagnosis: about 65 percent. `output.stdout` fallback and first-error summary exist; remaining gap was no direct “do something with this error” path.
- Daily writing ergonomics: about 60 percent. Chat persistence, copy/insert, Agent status, worklog grouping, and compile summary improved the base. Remaining gaps: error-to-agent handoff, tighter prompt templates, and fewer cramped controls.
- Visual polish: about 55 percent. The UI now reads more like restrained operational tooling, but it is still dense and card-heavy in the rail.
- System completeness: about 60 percent. The clean route is coherent, but the workflow still needs more end-to-end bridges from editor/PDF/logs into Agent actions.

## Task 1: PDF Error Card Publishes Agent Prompt

- [x] **Step 1: Write failing frontend test**

Extend `services/web/test/frontend/features/pdf-preview/components/error-logs.test.tsx`:

```ts
fireEvent.click(screen.getByRole('button', { name: 'Fix with Agent' }))
expect(prefillEvent.detail.mode).to.equal('agent')
expect(prefillEvent.detail.prompt).to.contain('pdflatex: gave an error')
expect(railEvent.detail).to.deep.equal({ tab: 'ai-assistant', open: true })
```

- [x] **Step 2: Run red test**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/pdf-preview/components/error-logs.test.tsx --grep "opens AI Agent"
```

Expected: fail because the button does not exist.

## Task 2: AI Assistant Consumes Pending Prompt

- [x] **Step 1: Write failing AI Assistant test**

Add a test to `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` that stores a pending prefill:

```ts
customLocalStorage.setItem(
  'superpaper.ai-assistant.project123.pending-prefill',
  JSON.stringify({
    projectId: 'project123',
    mode: 'agent',
    prompt: 'Fix the compile error.',
  })
)
```

Then render `<AiAssistantPanel />` and assert the Agent mode is selected and composer value is `Fix the compile error.`

- [x] **Step 2: Run red test**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "pending Agent prompt"
```

Expected: fail because pending prefill is ignored.

## Task 3: Shared Prefill Utility And UI

- [x] **Step 1: Create shared utility**

Create `services/web/frontend/js/features/ai-assistant/util/agent-prefill.ts` with:

- `AI_ASSISTANT_PREFILL_EVENT`
- `publishAiAssistantPrefill`
- `consumePendingAiAssistantPrefill`
- `buildCompileErrorAgentPrompt`

- [x] **Step 2: Add PDF summary action**

In `FirstCompilerErrorSummary`, add a `Fix with Agent` button that:

1. Builds a prompt from the first compiler error.
2. Publishes it for the current project.
3. Dispatches `ui:select-rail-tab` with `{ tab: 'ai-assistant', open: true }`.

- [x] **Step 3: Add AI Assistant consumer**

In `AiAssistantPanel`, consume pending prefill on mount and listen for `AI_ASSISTANT_PREFILL_EVENT`. Apply only matching `projectId`, switch mode, set prompt, and focus the composer.

- [x] **Step 4: Add translations**

Add:

```json
"fix_with_agent": "Fix with Agent"
```

Chinese:

```json
"fix_with_agent": "交给 Agent 修复"
```

## Task 4: Verification

- [x] **Step 1: Run focused frontend tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/pdf-preview/components/error-logs.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "opens AI Agent|pending Agent prompt"
```

- [x] **Step 2: Run targeted lint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/pdf-preview/components/error-logs.tsx frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx frontend/js/features/ai-assistant/util/agent-prefill.ts test/frontend/features/pdf-preview/components/error-logs.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

- [x] **Step 3: Run real browser smoke**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

- [x] **Step 4: Run whitespace check**

```bash
git diff --check
```
