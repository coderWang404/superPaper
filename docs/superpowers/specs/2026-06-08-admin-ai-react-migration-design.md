# Admin AI React Migration Design

## Context

The AI provider admin tab is currently rendered by a TypeScript module that manually writes HTML into `#ai-provider-admin`:

- Mount entry: `services/web/frontend/js/marketing.ts`
- Current UI module: `services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts`
- Server view mount: `services/web/app/views/admin/index.pug`
- Admin APIs: `services/web/app/src/Features/AiAssistant/AiProviderAdminController.mjs`
- Provider logic and redaction: `services/web/app/src/Features/AiAssistant/AiProviderManager.mjs`, `AiProviderSecrets.mjs`, and `AiProviderValidation.mjs`

Batch B already hardens the safe validation contract. This migration must happen after that contract lands because the React UI should consume stable safe errors instead of building behavior around transient controller responses.

## Goals

- Replace the manual DOM renderer with a React component tree mounted into the same admin tab root.
- Preserve all existing admin API endpoints and safe response shapes.
- Keep secrets server-side. API keys may be typed into password fields and sent to the server, but must never be rendered back, stored in React state longer than the form lifecycle, logged, or included in test snapshots.
- Preserve current behavior: list, create, preset fill, sync models, test provider, enable/disable, replace key, delete.
- Improve maintainability by splitting fetch/client logic, reducer/state transitions, and presentational components.

## Non-Goals

- No backend API route changes in the migration phase.
- No new provider types beyond `openai-compatible`.
- No move of admin provider management into the project editor UI.
- No broad redesign of the admin page outside the `#ai-provider-admin` mount.

## Sequencing

This work must start only after the Batch B safe validation contract is merged and verified:

- `AiProviderValidationError` and `ZodError` map to `422` with `{ error: { code, message, fields? } }`.
- Provider connectivity failures map to `502 PROVIDER_ERROR`.
- Missing provider on test/sync/update/delete maps to `404`.
- `redactProvider` guarantees `apiKey` and `encryptedApiKey` are absent from create, update, list, sync, and test responses.
- Frontend `safeMessageFromErrorBody` or its React replacement never displays submitted secret values.

The React migration should not try to repair the validation contract at the same time. If any of the above is not true, stop and finish Batch B first.

## Mount Strategy

Keep the existing Pug mount:

```pug
#ai-provider-admin(data-csrf-token=csrfToken)
  p.text-muted #{aiProviderLoading}
```

Keep `marketing.ts` as the entry for the admin page initially. Replace the current imperative initializer with a React mount:

```ts
import { createRoot } from 'react-dom/client'
import { AiProviderAdminApp } from './features/ai-provider-admin/components/ai-provider-admin-app'

const root = document.querySelector<HTMLElement>('#ai-provider-admin')

if (root) {
  createRoot(root).render(
    <AiProviderAdminApp csrfToken={root.dataset.csrfToken || ''} />
  )
}
```

Do not change the element id or data attribute. This keeps admin tab routing, translations tests, and the current server-rendered fallback intact.

## Component Boundaries

Create these frontend files:

- `services/web/frontend/js/features/ai-provider-admin/types.ts`
  - Shared provider, model, API response, error, and form types.
- `services/web/frontend/js/features/ai-provider-admin/translations.ts`
  - Existing `TRANSLATIONS`, `TranslationKey`, `AdminLanguage`, and `getAdminLanguage`.
- `services/web/frontend/js/features/ai-provider-admin/api.ts`
  - Fetch wrapper and endpoint helpers. This is the only frontend file that knows endpoint paths and CSRF header names.
- `services/web/frontend/js/features/ai-provider-admin/state.ts`
  - Reducer, actions, initial state, and pure helpers for replacing/removing providers.
- `services/web/frontend/js/features/ai-provider-admin/components/ai-provider-admin-app.tsx`
  - Data loading, reducer wiring, and high-level layout.
- `services/web/frontend/js/features/ai-provider-admin/components/provider-overview.tsx`
  - Metrics row.
- `services/web/frontend/js/features/ai-provider-admin/components/provider-table.tsx`
  - Table, rows, action buttons, replace-key form.
- `services/web/frontend/js/features/ai-provider-admin/components/provider-create-form.tsx`
  - Preset selector and create form.
- `services/web/frontend/js/features/ai-provider-admin/components/provider-feedback.tsx`
  - Status and error messages.

The existing `ai-provider-admin.ts` should become a small compatibility shim that exports `initAiProviderAdmin(root)` and mounts `AiProviderAdminApp`. This lets existing tests and imports move gradually:

```ts
export function initAiProviderAdmin(root: HTMLElement): void {
  createRoot(root).render(
    <AiProviderAdminApp csrfToken={root.dataset.csrfToken || ''} />
  )
}
```

## API Compatibility

The React API client must keep these routes and methods:

- `GET /admin/ai/providers` -> `{ providers: AiProvider[] }`
- `POST /admin/ai/providers` with `{ name, providerType, baseURL, apiKey, enabled, defaultModel, models }` -> `{ provider }`
- `PATCH /admin/ai/providers/:providerId` with `{ enabled }` -> `{ provider }`
- `PATCH /admin/ai/providers/:providerId` with `{ apiKey }` -> `{ provider }`
- `DELETE /admin/ai/providers/:providerId` -> `204`
- `POST /admin/ai/providers/:providerId/sync-models` -> `{ provider }`
- `POST /admin/ai/providers/:providerId/test` -> `{ ok, provider }`

Request headers:

```ts
{
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-Csrf-Token': csrfToken
}
```

Use `credentials: 'same-origin'`.

Safe error extraction:

```ts
type SafeApiError = {
  code?: string
  message: string
  fields?: Array<{ field: string; message: string }>
}
```

The React app may display `error.message` and field messages. It must ignore any unexpected fields. If a server response includes `apiKey`, `encryptedApiKey`, cookies, or raw submitted values, the client must not render them.

## State Model

Reducer state:

```ts
type ProviderAdminState = {
  providers: AiProvider[]
  loading: boolean
  activeAction: string | null
  expandedKeyProviderId: string | null
  statusMessage: TranslationKey | null
  error: SafeApiError | null
}
```

Actions:

- `load:start`
- `load:success`
- `load:error`
- `provider:add`
- `provider:replace`
- `provider:remove`
- `action:start`
- `action:finish`
- `replace-key:expand`
- `replace-key:collapse`
- `feedback:status`
- `feedback:error`

The reducer must ignore null provider payloads. A null provider from an endpoint should not crash the UI and should surface a safe request failure if the action expected a provider.

## Secret Handling

Rules:

- Provider API responses must use `hasApiKey: boolean`; never `apiKey` or `encryptedApiKey`.
- Create form API key is held in the DOM input until submit. On successful create, clear the input and reset the form. On failed create, leave the input in the DOM so the admin can correct non-secret fields, but never copy its value into reducer state or an error message.
- Replace key form should use local component state or uncontrolled input. Clear the field immediately after successful replacement and when the panel collapses.
- Do not log request bodies or error bodies in the admin UI.
- Tests must assert `screen.queryByText(secretValue)` is absent after successful and failed create/replace flows.
- API client error handling must whitelist `message` and `fields[].message`; it must not stringify full response bodies.

## Presets

Move preset definitions into a constant with the exact request values currently supported:

```ts
const PROVIDER_PRESETS = [
  {
    id: 'claudeaihub-gpt55',
    label: 'ClaudeAIHub - GPT-5.5',
    name: 'ClaudeAIHub - GPT-5.5',
    baseURL: 'https://claudeaihub.cloud/v1',
    defaultModel: 'gpt-5.5',
    modelIds: 'gpt-5.5',
  },
  {
    id: 'claudeaihub-opus48',
    label: 'ClaudeAIHub - Claude Opus 4.8',
    name: 'ClaudeAIHub - Claude Opus 4.8',
    baseURL: 'https://claudeaihub.cloud/v1',
    defaultModel: 'claude-opus-4-8',
    modelIds: 'claude-opus-4-8',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    modelIds: 'deepseek-chat',
  },
]
```

The current file contains duplicate preset handlers with slightly different values. The React migration must remove the duplicate behavior and keep one preset source.

## Accessibility

- Feedback uses `role="status"` for neutral status and `role="alert"` for errors.
- Each provider action button includes provider name in its accessible name.
- Replace key input label includes provider name.
- Delete confirmation text includes provider name.
- Table headers remain real `<th>` elements.
- Loading state should not remove the admin root; render a stable loading message.

## Tests

Frontend tests:

- Keep `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts` as the entry test file or rename it only if all imports are updated.
- Add reducer tests if the project has a local pattern for pure frontend units; otherwise test through rendered UI.
- Cover initial load, empty state, create, preset fill, sync, test, toggle, replace key, delete, API failure, null provider payload, and validation field errors.
- Add secret non-leak assertions for create and replace failures.

Backend tests remain Batch B ownership:

- `services/web/test/unit/src/AiAssistant/AiProviderAdminController.test.mjs`
- `services/web/test/unit/src/AiAssistant/AiProviderManager.test.mjs`
- `services/web/test/unit/src/AiAssistant/AiProviderValidation.test.mjs`

Migration verification must run both frontend and backend suites because React relies on the safe backend contract.

## Rollout

1. Land Batch B backend safe validation and frontend null-guard changes.
2. Add the React app behind the existing `initAiProviderAdmin` export and keep the same mount id.
3. Port tests from DOM-string assertions to React Testing Library queries.
4. Remove the manual HTML renderer only after the React tests cover every existing action.
5. Verify manually on `/admin#ai-providers` with a test admin account. Confirm no API key is visible in DOM text, page source generated after load, console logs, or network response bodies.

Deployment risk is medium because this rewrites the admin UI implementation. Risk is controlled by preserving endpoints, mount id, CSRF behavior, and server-rendered fallback text.
