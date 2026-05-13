# Project AI Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped AI chat backend that answers questions using project text files plus optional editor selection context.

**Architecture:** Build a read-only AI chat path inside `services/web/app/src/Features/AiAssistant`. The controller requires normal project read access through router middleware, builds a bounded context from project docs, calls the configured OpenAI-compatible provider, and returns an answer plus a list of included context files. No endpoint writes to MongoDB, docstore, or document-updater.

**Tech Stack:** Node ESM, Express JSON controller, existing Mongoose `AiProvider`, `ProjectEntityHandler.promises.getAllDocs`, Vitest unit tests, OpenAI-compatible `/chat/completions` over `fetch`.

---

## Scope

This phase implements backend chat only:

- `GET /project/:Project_id/ai/config` returns enabled providers and model choices.
- `POST /project/:Project_id/ai/chat` accepts a user prompt, optional provider/model IDs, optional selected text, and returns an answer.
- Context is deterministic and bounded: selected text first, then `.tex`, `.bib`, `.cls`, `.sty` documents.

This phase explicitly does not implement:

- Editor left rail UI.
- Direct document writes.
- Patch preview or apply-edit flows.
- Vector store indexing.

## File Structure

- Create: `services/web/app/src/Features/AiAssistant/AiProjectContextBuilder.mjs`
  - Reads project docs and builds a bounded prompt context with included file metadata.
- Modify: `services/web/app/src/Features/AiAssistant/AiProviderClient.mjs`
  - Add `createOpenAICompatibleChatCompletion`.
- Modify: `services/web/app/src/Features/AiAssistant/AiProviderManager.mjs`
  - Add helpers for finding enabled providers and resolving default models.
- Create: `services/web/app/src/Features/AiAssistant/AiProjectChatManager.mjs`
  - Orchestrates provider resolution, context building, and chat completion.
- Create: `services/web/app/src/Features/AiAssistant/AiProjectChatController.mjs`
  - JSON controller for project AI config/chat endpoints.
- Modify: `services/web/app/src/router.mjs`
  - Mount project AI endpoints behind `AuthorizationMiddleware.ensureUserCanReadProject`.
- Create: `services/web/test/unit/src/AiAssistant/AiProjectContextBuilder.test.mjs`
- Modify: `services/web/test/unit/src/AiAssistant/AiProviderClient.test.mjs`
- Create: `services/web/test/unit/src/AiAssistant/AiProjectChatManager.test.mjs`
- Create: `services/web/test/unit/src/AiAssistant/AiProjectChatController.test.mjs`

## API Contract

```text
GET  /project/:Project_id/ai/config
POST /project/:Project_id/ai/chat
```

`GET /project/:Project_id/ai/config` response:

```json
{
  "providers": [
    {
      "id": "provider-id",
      "name": "Claude Hub",
      "models": [
        { "id": "gpt-4.1", "displayName": "gpt-4.1", "enabled": true }
      ],
      "defaultModel": "gpt-4.1"
    }
  ]
}
```

`POST /project/:Project_id/ai/chat` request:

```json
{
  "prompt": "Explain the compile error",
  "providerId": "provider-id",
  "model": "gpt-4.1",
  "selection": {
    "docId": "doc-id",
    "path": "/main.tex",
    "text": "\\section{Intro}"
  }
}
```

`POST /project/:Project_id/ai/chat` response:

```json
{
  "answer": "The issue is...",
  "model": "gpt-4.1",
  "providerId": "provider-id",
  "context": {
    "includedFiles": ["/main.tex", "/refs.bib"],
    "selectionIncluded": true,
    "truncated": false
  }
}
```

## Task 1: Project Context Builder

**Files:**
- Create: `services/web/app/src/Features/AiAssistant/AiProjectContextBuilder.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProjectContextBuilder.test.mjs`

- [ ] **Step 1: Write failing tests**

Test that `buildProjectContext(projectId, { selection })`:

- Includes selected text before project files.
- Includes only `.tex`, `.bib`, `.cls`, and `.sty` docs.
- Respects a character budget and reports `truncated`.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd services/web
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/AiProjectContextBuilder.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal context builder**

Use `ProjectEntityHandler.promises.getAllDocs(projectId)`. Join doc `lines` with `\n`. Sort by priority: selection first, `main.tex`, other `.tex`, `.bib`, `.cls`, `.sty`. Return `{ messages, includedFiles, selectionIncluded, truncated }`.

- [ ] **Step 4: Verify tests pass**

Run the same targeted test and expect PASS.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/app/src/Features/AiAssistant/AiProjectContextBuilder.mjs services/web/test/unit/src/AiAssistant/AiProjectContextBuilder.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: build ai project context"
git push origin chore/remove-commercial-code
```

## Task 2: Chat Completion Client

**Files:**
- Modify: `services/web/app/src/Features/AiAssistant/AiProviderClient.mjs`
- Modify: `services/web/test/unit/src/AiAssistant/AiProviderClient.test.mjs`

- [ ] **Step 1: Write failing tests**

Add a test for `createOpenAICompatibleChatCompletion` that posts to `{baseURL}/chat/completions`, sends `Authorization: Bearer`, includes `model` and `messages`, and returns the first assistant message.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd services/web
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderClient.test.mjs
```

Expected: FAIL because the function does not exist.

- [ ] **Step 3: Implement minimal chat completion client**

Add `createOpenAICompatibleChatCompletion({ baseURL, apiKey, model, messages, fetchImpl, timeoutMs })`. Validate the response contains `choices[0].message.content`.

- [ ] **Step 4: Verify tests pass**

Run the same targeted test and expect PASS.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/app/src/Features/AiAssistant/AiProviderClient.mjs services/web/test/unit/src/AiAssistant/AiProviderClient.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: call ai chat completions"
git push origin chore/remove-commercial-code
```

## Task 3: Project Chat Manager

**Files:**
- Modify: `services/web/app/src/Features/AiAssistant/AiProviderManager.mjs`
- Create: `services/web/app/src/Features/AiAssistant/AiProjectChatManager.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProjectChatManager.test.mjs`

- [ ] **Step 1: Write failing manager tests**

Mock provider lookup, key decrypt, context builder, and provider client. Verify `chat({ projectId, prompt, selection })` sends a system message, context message, and user prompt, then returns answer and context metadata without exposing API keys.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd services/web
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/AiProjectChatManager.test.mjs
```

Expected: FAIL because the manager does not exist.

- [ ] **Step 3: Implement manager**

Implement `getProjectAiConfig()` and `chat()` using enabled providers only. If no provider/model exists, throw a typed error with code `AI_PROVIDER_NOT_CONFIGURED`.

- [ ] **Step 4: Verify tests pass**

Run the targeted test and expect PASS.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/app/src/Features/AiAssistant/AiProviderManager.mjs services/web/app/src/Features/AiAssistant/AiProjectChatManager.mjs services/web/test/unit/src/AiAssistant/AiProjectChatManager.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add project ai chat manager"
git push origin chore/remove-commercial-code
```

## Task 4: Project AI Controller And Routes

**Files:**
- Create: `services/web/app/src/Features/AiAssistant/AiProjectChatController.mjs`
- Modify: `services/web/app/src/router.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProjectChatController.test.mjs`

- [ ] **Step 1: Write failing controller tests**

Verify config and chat endpoints call the manager with `req.params.Project_id`, return JSON, map validation errors to 422, and map missing provider errors to 503.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd services/web
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/AiProjectChatController.test.mjs
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement controller**

Add JSON-only handlers. Do not add document write endpoints in this task.

- [ ] **Step 4: Stage router increment carefully**

Because `services/web/app/src/router.mjs` has unrelated dirty history, stage only:

```js
import AiProjectChatController from './Features/AiAssistant/AiProjectChatController.mjs'
```

and routes:

```js
webRouter.get(
  '/project/:Project_id/ai/config',
  AuthorizationMiddleware.ensureUserCanReadProject,
  AiProjectChatController.config
)
webRouter.post(
  '/project/:Project_id/ai/chat',
  AuthorizationMiddleware.ensureUserCanReadProject,
  AiProjectChatController.chat
)
```

- [ ] **Step 5: Verify tests and staged syntax**

Run:

```bash
cd services/web
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/AiProjectChatController.test.mjs
tmp=$(mktemp /tmp/router-staged-XXXXXX.mjs); git show :services/web/app/src/router.mjs > "$tmp"; node --check "$tmp"; rm "$tmp"
```

Expected: PASS and router staged blob parses.

- [ ] **Step 6: Commit and push**

```bash
git add services/web/app/src/Features/AiAssistant/AiProjectChatController.mjs services/web/test/unit/src/AiAssistant/AiProjectChatController.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: expose project ai chat api"
git push origin chore/remove-commercial-code
```

## Verification

- Run all AI Assistant unit tests:

```bash
cd services/web
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/*.test.mjs
```

- Run Pug precompile only if admin templates changed in this phase.
- Do not claim browser UI completion in this phase; there is no editor AI UI yet.

## Self-Review

- Spec coverage: this plan covers project config, contextual chat, provider/model resolution, and read-only project context.
- Placeholder scan: no API keys or channel secrets are copied into the repository.
- Type consistency: provider IDs, model IDs, context metadata, and errors use the same field names across manager and controller.
- Security: project routes rely on existing read authorization; API keys remain server-side and encrypted; model output is returned as untrusted text, not executed or applied.
