# AI Provider Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-party admin API for configuring OpenAI-compatible AI providers, securely storing API keys, and syncing model IDs.

**Architecture:** Keep the first AI slice inside `services/web` as `Features/AiAssistant`. The admin API validates all input, encrypts provider API keys before persistence, redacts secrets in every response, and uses a narrow provider client for `GET /models` so later chat/edit features do not depend on controller code.

**Tech Stack:** Node ESM, Express routes in `services/web/app/src/router.mjs`, Mongoose models, Vitest unit tests, Zod validation, Node global `fetch` with timeout, MongoDB-backed provider storage.

---

## Channel File Summary

The parent `../渠道.txt` file currently describes three non-secret channel shapes:

- An OpenAI-compatible provider with explicit `baseurl`.
- A second OpenAI-compatible provider with explicit `baseurl`.
- A DeepSeek key entry, treated as OpenAI-compatible with a later optional preset base URL.

The file is operational input only. Do not copy API keys into the repository, tests, logs, screenshots, or final messages.

## File Structure

- Create: `services/web/app/src/models/AiProvider.mjs`
  - Mongoose schema for provider metadata, encrypted API key blob, synced model IDs, default model, and health state.
- Create: `services/web/app/src/Features/AiAssistant/AiProviderValidation.mjs`
  - Zod schemas and normalization for admin provider create/update requests and provider model responses.
- Create: `services/web/app/src/Features/AiAssistant/AiProviderSecrets.mjs`
  - Encrypt, decrypt, and redact API keys. First implementation uses AES-256-GCM with a server-side secret derived from existing settings or environment.
- Create: `services/web/app/src/Features/AiAssistant/AiProviderClient.mjs`
  - OpenAI-compatible provider client for `GET {baseURL}/models` and future provider checks.
- Create: `services/web/app/src/Features/AiAssistant/AiProviderManager.mjs`
  - CRUD, encryption, redaction, model sync, and provider test orchestration.
- Create: `services/web/app/src/Features/AiAssistant/AiProviderAdminController.mjs`
  - JSON controller methods for admin endpoints.
- Modify: `services/web/app/src/router.mjs`
  - Mount `/admin/ai/providers` routes behind `AuthorizationMiddleware.ensureUserIsSiteAdmin`.
- Modify: `services/web/app/views/admin/index.pug`
  - Add an admin tab linking to the JSON provider endpoints or basic form once the API is stable.
- Create: `services/web/test/unit/src/AiAssistant/AiProviderValidation.test.mjs`
- Create: `services/web/test/unit/src/AiAssistant/AiProviderSecrets.test.mjs`
- Create: `services/web/test/unit/src/AiAssistant/AiProviderClient.test.mjs`
- Create: `services/web/test/unit/src/AiAssistant/AiProviderManager.test.mjs`
- Create: `services/web/test/unit/src/AiAssistant/AiProviderAdminController.test.mjs`

## API Contract

Admin endpoints return JSON only:

```text
GET    /admin/ai/providers
POST   /admin/ai/providers
PATCH  /admin/ai/providers/:providerId
DELETE /admin/ai/providers/:providerId
POST   /admin/ai/providers/:providerId/sync-models
POST   /admin/ai/providers/:providerId/test
```

Provider response shape:

```json
{
  "id": "provider-id",
  "name": "Local Gateway",
  "providerType": "openai-compatible",
  "baseURL": "https://example.invalid",
  "enabled": true,
  "hasApiKey": true,
  "models": [
    {
      "id": "gpt-4.1",
      "displayName": "gpt-4.1",
      "source": "synced",
      "enabled": true
    }
  ],
  "defaultModel": "gpt-4.1",
  "lastModelSyncAt": "2026-05-13T00:00:00.000Z",
  "healthStatus": "ok",
  "createdAt": "2026-05-13T00:00:00.000Z",
  "updatedAt": "2026-05-13T00:00:00.000Z"
}
```

Error response shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid AI provider input",
    "details": {}
  }
}
```

## Task 1: Provider Validation

**Files:**
- Create: `services/web/app/src/Features/AiAssistant/AiProviderValidation.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProviderValidation.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { expect } from 'vitest'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderValidation.mjs'

describe('AiProviderValidation', function () {
  beforeEach(async function (ctx) {
    ctx.Validation = await import(modulePath)
  })

  it('normalizes create input for an OpenAI-compatible provider', function (ctx) {
    const input = ctx.Validation.parseCreateProviderInput({
      name: '  Claude Hub  ',
      providerType: 'openai-compatible',
      baseURL: 'https://claudeaihub.cloud/',
      apiKey: 'test-key',
      enabled: true,
    })

    expect(input).to.deep.equal({
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://claudeaihub.cloud',
      apiKey: 'test-key',
      enabled: true,
      defaultModel: null,
      models: [],
    })
  })

  it('rejects non-https provider URLs', function (ctx) {
    expect(() =>
      ctx.Validation.parseCreateProviderInput({
        name: 'Unsafe',
        providerType: 'openai-compatible',
        baseURL: 'http://localhost:11434',
        apiKey: 'test-key',
      })
    ).to.throw('baseURL must use https')
  })

  it('extracts model IDs from OpenAI-compatible model list responses', function (ctx) {
    const models = ctx.Validation.parseOpenAIModelsResponse({
      object: 'list',
      data: [
        { id: 'gpt-4.1', object: 'model' },
        { id: 'deepseek-chat', object: 'model' },
      ],
    })

    expect(models).to.deep.equal([
      { id: 'gpt-4.1', displayName: 'gpt-4.1', source: 'synced', enabled: true },
      {
        id: 'deepseek-chat',
        displayName: 'deepseek-chat',
        source: 'synced',
        enabled: true,
      },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderValidation.test.mjs
```

Expected: FAIL because `AiProviderValidation.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `AiProviderValidation.mjs` with exported functions:

```js
import { z } from 'zod'

const PROVIDER_TYPES = ['openai-compatible']

const ModelInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).optional(),
  source: z.enum(['manual', 'synced']).default('manual'),
  enabled: z.boolean().default(true),
})

const CreateProviderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  providerType: z.enum(PROVIDER_TYPES).default('openai-compatible'),
  baseURL: z.string().trim().url(),
  apiKey: z.string().min(1),
  enabled: z.boolean().default(true),
  defaultModel: z.string().trim().min(1).max(200).nullable().optional(),
  models: z.array(ModelInputSchema).default([]),
})

const OpenAIModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().trim().min(1).max(200),
    })
  ),
})

function normalizeBaseURL(baseURL) {
  const url = new URL(baseURL)
  if (url.protocol !== 'https:') {
    throw new Error('baseURL must use https')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function normalizeModel(model) {
  return {
    id: model.id,
    displayName: model.displayName || model.id,
    source: model.source,
    enabled: model.enabled,
  }
}

export function parseCreateProviderInput(body) {
  const parsed = CreateProviderInputSchema.parse(body)
  return {
    ...parsed,
    baseURL: normalizeBaseURL(parsed.baseURL),
    defaultModel: parsed.defaultModel || null,
    models: parsed.models.map(normalizeModel),
  }
}

export function parseOpenAIModelsResponse(body) {
  const parsed = OpenAIModelsResponseSchema.parse(body)
  return parsed.data.map(model =>
    normalizeModel({
      id: model.id,
      displayName: model.id,
      source: 'synced',
      enabled: true,
    })
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderValidation.test.mjs
```

Expected: PASS for this file.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/app/src/Features/AiAssistant/AiProviderValidation.mjs services/web/test/unit/src/AiAssistant/AiProviderValidation.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add ai provider validation"
git push origin chore/remove-commercial-code
```

## Task 2: Secret Encryption And Redaction

**Files:**
- Create: `services/web/app/src/Features/AiAssistant/AiProviderSecrets.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProviderSecrets.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { expect } from 'vitest'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderSecrets.mjs'

describe('AiProviderSecrets', function () {
  beforeEach(async function (ctx) {
    ctx.Secrets = await import(modulePath)
  })

  it('encrypts and decrypts API keys without storing plaintext', async function (ctx) {
    const encrypted = await ctx.Secrets.encryptApiKey('test-api-key', {
      secret: '0123456789abcdef0123456789abcdef',
    })

    expect(encrypted).to.be.a('string')
    expect(encrypted).not.to.include('test-api-key')
    expect(
      await ctx.Secrets.decryptApiKey(encrypted, {
        secret: '0123456789abcdef0123456789abcdef',
      })
    ).to.equal('test-api-key')
  })

  it('redacts provider records for browser responses', function (ctx) {
    const publicProvider = ctx.Secrets.redactProvider({
      _id: 'provider-id',
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://claudeaihub.cloud',
      encryptedApiKey: 'encrypted',
      models: [],
      enabled: true,
    })

    expect(publicProvider).to.include({
      id: 'provider-id',
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://claudeaihub.cloud',
      hasApiKey: true,
      enabled: true,
    })
    expect(publicProvider).not.to.have.property('encryptedApiKey')
    expect(publicProvider).not.to.have.property('apiKey')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderSecrets.test.mjs
```

Expected: FAIL because `AiProviderSecrets.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `AiProviderSecrets.mjs` with AES-256-GCM helpers. The default secret must come from `process.env.AI_PROVIDER_SECRET` first, then `process.env.SESSION_SECRET`; tests pass an explicit secret.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderSecrets.test.mjs
```

Expected: PASS for this file.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/app/src/Features/AiAssistant/AiProviderSecrets.mjs services/web/test/unit/src/AiAssistant/AiProviderSecrets.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: encrypt ai provider secrets"
git push origin chore/remove-commercial-code
```

## Task 3: Provider Model And Manager

**Files:**
- Create: `services/web/app/src/models/AiProvider.mjs`
- Create: `services/web/app/src/Features/AiAssistant/AiProviderClient.mjs`
- Create: `services/web/app/src/Features/AiAssistant/AiProviderManager.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProviderClient.test.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProviderManager.test.mjs`

- [ ] **Step 1: Write failing client tests**

Test `syncModels` with an injected `fetch` function that returns `{ data: [{ id: 'gpt-4.1' }] }`. Assert the client calls `https://example.invalid/models` with an `Authorization: Bearer <key>` header and returns normalized models.

- [ ] **Step 2: Verify client test fails**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderClient.test.mjs
```

Expected: FAIL because `AiProviderClient.mjs` does not exist.

- [ ] **Step 3: Implement minimal client**

Create `AiProviderClient.mjs` with `syncOpenAICompatibleModels({ baseURL, apiKey, fetchImpl = fetch })`.

- [ ] **Step 4: Write failing manager tests**

Mock `AiProvider` and `AiProviderSecrets`. Verify `createProvider` encrypts the key, stores `encryptedApiKey`, does not store plaintext `apiKey`, and returns a redacted provider.

- [ ] **Step 5: Verify manager test fails**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderManager.test.mjs
```

Expected: FAIL because `AiProviderManager.mjs` and `AiProvider.mjs` do not exist.

- [ ] **Step 6: Implement model and manager**

Create `AiProvider.mjs` with collection `aiProviders`. Create `AiProviderManager.mjs` with `listProviders`, `createProvider`, `updateProvider`, `deleteProvider`, `syncModels`, and `testProvider`.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderClient.test.mjs test/unit/src/AiAssistant/AiProviderManager.test.mjs
```

Expected: PASS for both files.

- [ ] **Step 8: Commit and push**

```bash
git add services/web/app/src/models/AiProvider.mjs services/web/app/src/Features/AiAssistant/AiProviderClient.mjs services/web/app/src/Features/AiAssistant/AiProviderManager.mjs services/web/test/unit/src/AiAssistant/AiProviderClient.test.mjs services/web/test/unit/src/AiAssistant/AiProviderManager.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add ai provider manager"
git push origin chore/remove-commercial-code
```

## Task 4: Admin JSON Controller And Routes

**Files:**
- Create: `services/web/app/src/Features/AiAssistant/AiProviderAdminController.mjs`
- Modify: `services/web/app/src/router.mjs`
- Test: `services/web/test/unit/src/AiAssistant/AiProviderAdminController.test.mjs`

- [ ] **Step 1: Write failing controller tests**

Mock `AiProviderManager` and verify `list`, `create`, `update`, `delete`, `syncModels`, and `testProvider` call the expected manager methods and never include secret fields in JSON responses.

- [ ] **Step 2: Verify controller test fails**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderAdminController.test.mjs
```

Expected: FAIL because `AiProviderAdminController.mjs` does not exist.

- [ ] **Step 3: Implement controller**

Create JSON handlers using `expressify`. Validation errors return HTTP 422 with `{ error: { code: 'VALIDATION_ERROR' } }`. Provider connectivity errors return HTTP 502 with `{ error: { code: 'PROVIDER_ERROR' } }`.

- [ ] **Step 4: Mount routes**

In `services/web/app/src/router.mjs`, import `AiProviderAdminController` and mount the admin endpoints immediately after the existing `/admin` route block, each behind `AuthorizationMiddleware.ensureUserIsSiteAdmin`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
cd services/web
yarn run test:unit:parallel test/unit/src/AiAssistant/AiProviderAdminController.test.mjs
```

Expected: PASS for this file.

- [ ] **Step 6: Commit and push**

```bash
git add services/web/app/src/Features/AiAssistant/AiProviderAdminController.mjs services/web/app/src/router.mjs services/web/test/unit/src/AiAssistant/AiProviderAdminController.test.mjs
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: expose ai provider admin api"
git push origin chore/remove-commercial-code
```

## Task 5: Admin Page Entry And Browser Check

**Files:**
- Modify: `services/web/app/views/admin/index.pug`

- [ ] **Step 1: Add AI Providers tab**

Add a new `AI Providers` tab to the existing admin Pug page. The first UI can be minimal: show endpoint documentation and a form shell that posts JSON later. Do not put API keys in server-rendered HTML after submission.

- [ ] **Step 2: Run Pug precompile or admin route smoke check**

Run:

```bash
cd services/web
yarn run precompile-pug
```

Expected: exits 0, or record the exact environment blocker.

- [ ] **Step 3: Browser verify admin access**

Open `http://127.0.0.1:23000/admin` in the browser with `ADMIN_PRIVILEGE_AVAILABLE=true` and a site admin user. Verify the `AI Providers` tab renders and existing admin tabs still render.

- [ ] **Step 4: Commit and push**

```bash
git add services/web/app/views/admin/index.pug
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add ai provider admin entry"
git push origin chore/remove-commercial-code
```

## Self-Review

- Spec coverage: this plan covers admin provider CRUD, encrypted API key storage, model sync, and admin endpoint wiring. Editor contextual chat and edit application are intentionally deferred to the next plan.
- Placeholder scan: no task relies on hidden API keys or unresolved vendor-specific SDKs.
- Type consistency: provider type is consistently `openai-compatible`; public responses use `hasApiKey`; model source values are `manual` or `synced`.
- Security: API keys are write-only from browser to server, encrypted at rest, redacted from every response, and never read from `../渠道.txt` at runtime.
