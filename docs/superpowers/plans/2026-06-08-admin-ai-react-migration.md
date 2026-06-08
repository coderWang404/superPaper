# Admin AI React Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the AI provider admin tab from manual DOM rendering to React without changing backend API contracts or leaking provider secrets.

**Architecture:** Keep `#ai-provider-admin` and `initAiProviderAdmin(root)` as compatibility boundaries. Split the React implementation into typed API helpers, reducer state, translations, and focused components, then retire the manual string renderer after parity tests pass.

**Tech Stack:** React, TypeScript, React Testing Library, fetch-mock, Express admin APIs, Mocha.

---

## Preconditions

Do not start this plan until Batch B is merged and verified. Confirm with:

```bash
cd services/web
yarn test:unit test/unit/src/AiAssistant/AiProviderAdminController.test.mjs test/unit/src/AiAssistant/AiProviderManager.test.mjs test/unit/src/AiAssistant/AiProviderValidation.test.mjs
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts --grep "field-safe errors|null provider|secret"
```

Expected: all Batch B safe-contract tests pass. If the grep finds no tests, add or finish Batch B tests before this migration.

## File Structure

- Create: `services/web/frontend/js/features/ai-provider-admin/types.ts`
- Create: `services/web/frontend/js/features/ai-provider-admin/translations.ts`
- Create: `services/web/frontend/js/features/ai-provider-admin/api.ts`
- Create: `services/web/frontend/js/features/ai-provider-admin/state.ts`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/ai-provider-admin-app.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-overview.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-feedback.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-table.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-create-form.tsx`
- Modify: `services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts`
- Modify: `services/web/frontend/js/marketing.ts` only if JSX import requirements demand a direct component mount; prefer keeping the initializer.
- Modify: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`

## Task 1: Extract Types, Translations, API, And Reducer

**Files:**
- Create: `services/web/frontend/js/features/ai-provider-admin/types.ts`
- Create: `services/web/frontend/js/features/ai-provider-admin/translations.ts`
- Create: `services/web/frontend/js/features/ai-provider-admin/api.ts`
- Create: `services/web/frontend/js/features/ai-provider-admin/state.ts`
- Test: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`

- [ ] **Step 1: Add failing safe API tests**

Add tests that import the new API helpers and verify safe error extraction:

```ts
it('extracts safe validation field messages without rendering secrets', async function () {
  const submittedCredential = 'test-provider-key-value'

  fetchMock.post('/admin/ai/providers', {
    status: 422,
    body: {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI provider input',
        fields: [{ field: 'baseURL', message: 'baseURL must use https' }],
        apiKey: submittedCredential,
      },
    },
  })

  const { createProvider } = await import(
    '../../../../frontend/js/features/ai-provider-admin/api'
  )

  await expect(
    createProvider('csrf-token', {
      name: 'Unsafe',
      providerType: 'openai-compatible',
      baseURL: 'http://example.test/v1',
      apiKey: submittedCredential,
      enabled: true,
      defaultModel: null,
      models: [],
    })
  ).to.be.rejectedWith('Invalid AI provider input: baseURL must use https')
})
```

- [ ] **Step 2: Run the failing API test**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts --grep "safe validation"
```

Expected: fail because `api.ts` does not exist.

- [ ] **Step 3: Create shared modules**

`types.ts` should contain:

```ts
export type AiProviderModel = {
  id: string
  displayName: string
  source: 'manual' | 'synced'
  enabled: boolean
}

export type AiProvider = {
  id: string
  name: string
  providerType: 'openai-compatible'
  baseURL: string
  enabled: boolean
  hasApiKey: boolean
  models: AiProviderModel[]
  defaultModel: string | null
  healthStatus: 'unknown' | 'ok' | 'error'
}

export type SafeApiError = {
  code?: string
  message: string
  fields?: Array<{ field: string; message: string }>
}

export type ProviderInput = {
  name: string
  providerType: 'openai-compatible'
  baseURL: string
  apiKey: string
  enabled: boolean
  defaultModel: string | null
  models: AiProviderModel[]
}
```

`api.ts` should expose `listProviders`, `createProvider`, `updateProvider`, `deleteProvider`, `syncModels`, and `testProvider`, all using the same endpoint paths and CSRF header as the current module. The error class should only store safe messages:

```ts
export class AiProviderAdminRequestError extends Error {
  constructor(message: string, public safeError?: SafeApiError) {
    super(message)
    this.name = 'AiProviderAdminRequestError'
  }
}
```

`state.ts` should export reducer actions and ignore null providers in `provider:replace`.

- [ ] **Step 4: Run extracted module tests**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts --grep "safe validation"
```

Expected: safe API test passes.

- [ ] **Step 5: Commit**

```bash
git add services/web/frontend/js/features/ai-provider-admin/types.ts services/web/frontend/js/features/ai-provider-admin/translations.ts services/web/frontend/js/features/ai-provider-admin/api.ts services/web/frontend/js/features/ai-provider-admin/state.ts services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
git commit -m "refactor(admin): extract AI provider admin client state"
```

## Task 2: Build React Components Behind Existing Initializer

**Files:**
- Create: `services/web/frontend/js/features/ai-provider-admin/components/ai-provider-admin-app.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-overview.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-feedback.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-table.tsx`
- Create: `services/web/frontend/js/features/ai-provider-admin/components/provider-create-form.tsx`
- Modify: `services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts`
- Test: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`

- [ ] **Step 1: Add failing parity render test**

Update the first existing test so it still calls `initAiProviderAdmin(renderRoot())` and uses Testing Library queries:

```ts
it('loads and renders provider rows with redacted key state', async function () {
  fetchMock.get('/admin/ai/providers', {
    providers: [
      providerFixture({
        id: 'provider-one',
        name: 'OpenAI gateway',
        baseURL: 'https://api.example.test/v1',
        hasApiKey: true,
        models: [{ id: 'gpt-4.1', displayName: 'gpt-4.1', source: 'synced', enabled: true }],
      }),
    ],
  })

  initAiProviderAdmin(renderRoot())

  await screen.findByText('OpenAI gateway')
  screen.getByText('https://api.example.test/v1')
  screen.getByText('API key stored')
  expect(screen.queryByText('encryptedApiKey')).to.equal(null)
})
```

- [ ] **Step 2: Run failing parity test**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts --grep "redacted key"
```

Expected: fail until React components and shim exist.

- [ ] **Step 3: Implement React app and shim**

`ai-provider-admin.ts` becomes:

```ts
import { createRoot } from 'react-dom/client'
import { AiProviderAdminApp } from './components/ai-provider-admin-app'

export function initAiProviderAdmin(root: HTMLElement): void {
  createRoot(root).render(
    <AiProviderAdminApp csrfToken={root.dataset.csrfToken || ''} />
  )
}
```

`AiProviderAdminApp` should:

- `useReducer(providerAdminReducer, initialProviderAdminState)`.
- Load providers in `useEffect`.
- Dispatch safe status and error actions.
- Pass callbacks to child components.
- Never store API key values in reducer state.

Use uncontrolled password inputs in create and replace forms:

```tsx
const apiKeyRef = useRef<HTMLInputElement>(null)
```

On successful submit:

```ts
form.reset()
if (apiKeyRef.current) apiKeyRef.current.value = ''
```

- [ ] **Step 4: Run parity render test**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts --grep "redacted key"
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts services/web/frontend/js/features/ai-provider-admin/components services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
git commit -m "refactor(admin): mount AI provider admin React app"
```

## Task 3: Port Create, Presets, Sync, Test, Toggle, Delete

**Files:**
- Modify: `services/web/frontend/js/features/ai-provider-admin/components/provider-create-form.tsx`
- Modify: `services/web/frontend/js/features/ai-provider-admin/components/provider-table.tsx`
- Modify: `services/web/frontend/js/features/ai-provider-admin/components/ai-provider-admin-app.tsx`
- Test: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`

- [ ] **Step 1: Add failing action parity tests**

Port or add tests for:

- Create sends normalized models from comma/newline input.
- Selecting the DeepSeek preset fills `name`, `baseURL`, `defaultModel`, and `modelIds`.
- Sync calls `/admin/ai/providers/provider-one/sync-models`.
- Test calls `/admin/ai/providers/provider-one/test`.
- Toggle sends `PATCH { enabled: false }` or `{ enabled: true }`.
- Delete confirms and calls `DELETE`.

Use this create assertion:

```ts
const submittedCredential = 'test-provider-key-value'
const createCall = fetchMock.callHistory.calls('/admin/ai/providers')[1]
expect(JSON.parse(createCall.options.body as string)).to.deep.equal({
  name: 'DeepSeek',
  providerType: 'openai-compatible',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: submittedCredential,
  enabled: true,
  defaultModel: 'deepseek-chat',
  models: [
    {
      id: 'deepseek-chat',
      displayName: 'deepseek-chat',
      source: 'manual',
      enabled: true,
    },
  ],
})
```

- [ ] **Step 2: Run action parity tests**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts --grep "creates|preset|sync|test|toggle|delete"
```

Expected: failures for any unported actions.

- [ ] **Step 3: Implement actions**

Implement one callback per API action in `AiProviderAdminApp`. For actions that expect a provider response:

```ts
if (!response.provider?.id) {
  throw new AiProviderAdminRequestError(t('requestFailed'))
}
```

Do not render or store unexpected provider secret fields. `ProviderTable` should display `API key stored` only from `hasApiKey`.

- [ ] **Step 4: Run action parity tests**

Run the same command from Step 2.

Expected: all action parity tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/web/frontend/js/features/ai-provider-admin/components services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
git commit -m "refactor(admin): port AI provider admin actions"
```

## Task 4: Secret Non-Leak And Validation UX

**Files:**
- Modify: `services/web/frontend/js/features/ai-provider-admin/api.ts`
- Modify: `services/web/frontend/js/features/ai-provider-admin/components/provider-feedback.tsx`
- Modify: `services/web/frontend/js/features/ai-provider-admin/components/provider-create-form.tsx`
- Modify: `services/web/frontend/js/features/ai-provider-admin/components/provider-table.tsx`
- Test: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`

- [ ] **Step 1: Add failing non-leak tests**

Add tests for create and replace failures:

```ts
it('does not render submitted API keys after create validation errors', async function () {
  fetchMock.get('/admin/ai/providers', { providers: [] })
  fetchMock.post('/admin/ai/providers', {
    status: 422,
    body: {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI provider input',
        fields: [{ field: 'baseURL', message: 'baseURL must use https' }],
      },
    },
  })

  initAiProviderAdmin(renderRoot())
  await screen.findByText('No AI providers configured')
  await userEvent.type(screen.getByLabelText('Provider name'), 'Bad provider')
  await userEvent.type(screen.getByLabelText('Base URL'), 'http://bad.test/v1')
  await userEvent.type(screen.getByLabelText('API key'), 'test-api-key-value')
  await userEvent.click(screen.getByRole('button', { name: 'Add provider' }))

  await screen.findByRole('alert')
  screen.getByText(/baseURL must use https/)
  expect(screen.queryByText('test-api-key-value')).to.equal(null)
})
```

Add an equivalent replace-key failure test using `New API key for OpenAI gateway`.

- [ ] **Step 2: Run non-leak tests**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts --grep "does not render submitted API keys"
```

Expected: fail if errors stringify full bodies or key values appear in DOM.

- [ ] **Step 3: Harden error rendering**

Ensure `safeMessageFromErrorBody` only reads:

- `error.message`
- `error.fields[].message`

Ignore every other field. `ProviderFeedback` should render escaped React text only, not `dangerouslySetInnerHTML`.

- [ ] **Step 4: Run full AI provider admin frontend suite**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/web/frontend/js/features/ai-provider-admin services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
git commit -m "test(admin): prevent AI provider secret leakage"
```

## Task 5: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run backend safe-contract tests**

```bash
cd services/web
yarn test:unit test/unit/src/AiAssistant/AiProviderAdminController.test.mjs test/unit/src/AiAssistant/AiProviderManager.test.mjs test/unit/src/AiAssistant/AiProviderValidation.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run frontend admin tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
```

Expected: all pass.

- [ ] **Step 3: Run lint and diff checks**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-provider-admin frontend/js/marketing.ts test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts
git diff --check
```

Expected: exit code 0.

- [ ] **Step 4: Browser smoke on admin tab**

Start the web app using the repository's normal local development command. Open `/admin#ai-providers` as a site admin. Verify:

- Provider list loads.
- Create form accepts a test provider.
- Sync/test/toggle/delete controls work.
- DOM text and network JSON responses do not contain submitted API key values.

Record the exact dev command, URL, browser, and result in the implementation closeout.
