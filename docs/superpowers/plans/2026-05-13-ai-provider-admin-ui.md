# AI Provider Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI Providers admin tab API reference with a usable site-admin interface for adding OpenAI-compatible providers, saving base URLs/API keys, testing connectivity, and syncing model IDs.

**Architecture:** Reuse the existing `/admin/ai/providers` JSON API and keep the UI inside the current Pug-rendered admin page. Add a small browser script mounted from `services/web/app/views/admin/index.pug` so this first admin slice does not require a new webpack entrypoint or React island. The browser never receives API keys from the server; keys are only submitted from password fields and immediately cleared after create/update.

**Tech Stack:** Pug, Bootstrap-era admin markup, vanilla browser JavaScript, existing JSON admin endpoints, CSRF token from the admin page, Cypress component/browser-independent unit tests via Mocha + JSDOM where feasible, backend unit tests already covering API redaction and validation.

---

## Scope

This phase implements:

- Provider list loading in the existing Admin Panel `AI Providers` tab.
- A create form with `name`, `baseURL`, `apiKey`, `enabled`, optional model IDs, and optional default model.
- Per-provider actions:
  - Sync models from `POST /admin/ai/providers/:providerId/sync-models`.
  - Test provider from `POST /admin/ai/providers/:providerId/test`.
  - Toggle enabled using `PATCH /admin/ai/providers/:providerId`.
  - Replace API key using `PATCH /admin/ai/providers/:providerId`.
  - Delete provider using `DELETE /admin/ai/providers/:providerId` after browser confirmation.
- User-facing status/error messages without exposing API keys or raw stack traces.

This phase does not implement:

- Provider presets.
- Per-user provider selection.
- Rate limits or usage dashboards.
- Model capability metadata beyond ID/display name/enabled.

## File Structure

- Modify: `services/web/app/views/admin/index.pug`
  - Replace the static AI Providers endpoint table with the provider manager container and form.
  - Pass CSRF token through a `data-csrf-token` attribute.
- Create: `services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts`
  - Browser-side controller for loading, rendering, and submitting provider admin actions.
- Create: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`
  - Unit tests for request shape, API key clearing, rendering redacted providers, and model sync/test actions.
- Modify: `services/web/frontend/stylesheets/pages/all.scss`
  - Import admin AI provider styles only if a page-level stylesheet is already used for admin tabs.
- Create if needed: `services/web/frontend/stylesheets/pages/admin/ai-provider-admin.scss`
  - Compact table/form styling using existing Bootstrap variables and no decorative card nesting.

## UI Contract

The tab should contain:

- Heading: `AI Providers`.
- Status region: `role="status"` for success/progress messages.
- Alert region: `role="alert"` for errors.
- Provider table:
  - Columns: `Name`, `Base URL`, `Models`, `Default`, `Health`, `Enabled`, `Actions`.
  - Key state: display `API key stored` when `hasApiKey` is true; never display key material.
  - Empty state: `No AI providers configured`.
- Create form:
  - `Provider name`
  - `Base URL`
  - `API key`
  - `Enabled`
  - `Model IDs`
  - `Default model`
  - Submit button: `Add provider`
- Replace-key form per provider:
  - Password input labelled `New API key for <provider name>`.
  - Submit button: `Replace key`.

## API Contract Used By UI

The UI consumes the existing admin JSON endpoints:

```text
GET    /admin/ai/providers
POST   /admin/ai/providers
PATCH  /admin/ai/providers/:providerId
DELETE /admin/ai/providers/:providerId
POST   /admin/ai/providers/:providerId/sync-models
POST   /admin/ai/providers/:providerId/test
```

Requests include:

```json
{
  "_csrf": "token-from-page"
}
```

for mutating requests if the existing fetch middleware requires it. If the admin API accepts CSRF via header, use:

```text
X-CSRF-Token: token-from-page
```

Provider create request:

```json
{
  "name": "OpenAI Gateway",
  "providerType": "openai-compatible",
  "baseURL": "https://api.example.com/v1",
  "apiKey": "entered-in-password-field",
  "enabled": true,
  "models": [
    {
      "id": "gpt-4.1",
      "displayName": "gpt-4.1",
      "source": "manual",
      "enabled": true
    }
  ],
  "defaultModel": "gpt-4.1"
}
```

## Task 1: Browser Controller API Client

**Files:**
- Create: `services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts`
- Test: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that build a JSDOM container with `data-csrf-token="csrf-token"` and mock `global.fetch`.

Test cases:

```ts
it('loads providers from the admin endpoint and renders redacted providers')
it('creates a provider with baseURL and apiKey, then clears the password field')
it('syncs models for a provider using the sync endpoint')
it('shows a safe error message when the API fails')
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT corepack yarn exec mocha --timeout 5000 --exit --extension ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
```

Expected: FAIL because `ai-provider-admin.ts` does not exist.

- [ ] **Step 3: Implement minimal controller**

Export:

```ts
export function initAiProviderAdmin(root: HTMLElement): void
```

The controller should:

- Read CSRF from `root.dataset.csrfToken`.
- Fetch `/admin/ai/providers` on init.
- Render table rows from response providers.
- Submit create form to `POST /admin/ai/providers`.
- Include `X-CSRF-Token` on mutating requests.
- Clear the create password input after a successful create.
- Render only safe error text: `AI provider request failed`.

- [ ] **Step 4: Run test to verify it passes**

Run the same targeted Mocha command and expect PASS.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add ai provider admin browser controller"
git push origin chore/remove-commercial-code
```

## Task 2: Admin Tab Markup And Script Boot

**Files:**
- Modify: `services/web/app/views/admin/index.pug`
- Modify if generated templates are tracked: `services/web/app/views/admin/index.js`

- [ ] **Step 1: Add failing render expectation**

Add or update a Pug/admin render test if one exists. If no focused render test exists, use `precompile-pug` as the verification gate for this task.

Expected markup:

```html
<div id="ai-provider-admin" data-csrf-token="...">
```

- [ ] **Step 2: Replace static endpoint table**

In `services/web/app/views/admin/index.pug`, replace the static AI endpoint table under `#ai-providers` with:

- `#ai-provider-admin(data-csrf-token=csrfToken)`
- status and error regions
- provider list container
- create form matching the UI contract
- inline boot script that imports or invokes the controller according to existing frontend bundling constraints.

- [ ] **Step 3: Compile Pug**

Run:

```bash
cd services/web
corepack yarn run precompile-pug
```

Expected: PASS and generated `services/web/app/views/admin/index.js` updated if the repo tracks compiled templates.

- [ ] **Step 4: Run browser-controller tests**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT corepack yarn exec mocha --timeout 5000 --exit --extension ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/app/views/admin/index.pug services/web/app/views/admin/index.js services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add ai provider admin page"
git push origin chore/remove-commercial-code
```

## Task 3: Manual Admin Flow Verification

**Files:**
- No source changes unless verification finds a defect.

- [ ] **Step 1: Start or reuse the Docker/dev server**

Confirm the web service is reachable on the current local port.

- [ ] **Step 2: Open the admin page in Browser Use or Chrome DevTools**

Navigate to:

```text
http://localhost:<port>/admin#ai-providers
```

- [ ] **Step 3: Verify page behavior without secrets**

Check:

- AI Providers tab renders.
- Empty state appears when no providers exist.
- Form does not display entered API key after submit.
- Sync/test buttons call the expected endpoints.
- No console errors.

- [ ] **Step 4: Commit any fixes and push**

If source changes were required, run the targeted tests and commit with:

```bash
git commit -m "fix: polish ai provider admin flow"
git push origin chore/remove-commercial-code
```

## Final Verification

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT corepack yarn exec mocha --timeout 5000 --exit --extension ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/*.test.mjs
corepack yarn run precompile-pug
```

Then check:

```bash
git status --short
git log --oneline -8
```

Do not claim a real provider was configured unless the user explicitly authorizes using values from `../渠道.txt` and no secret values are printed, logged, or committed.
