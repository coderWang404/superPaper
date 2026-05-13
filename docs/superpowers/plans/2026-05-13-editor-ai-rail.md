# Editor AI Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first editor-side AI assistant surface as a left rail tab that can ask project-scoped questions using the existing project AI chat backend and optional current editor selection.

**Architecture:** Keep the first frontend slice inside `services/web/frontend/js/features/ide-react/components/rail`. Add a focused API client under `services/web/frontend/js/features/ai-assistant`, then mount an `ai-assistant` rail tab in the existing `RailLayout`. The first release is read-only: it sends prompts and selection context, renders answers and included file metadata, and does not write to documents.

**Tech Stack:** React, TypeScript, existing `fetch-json` helpers, `ProjectContext`, `EditorOpenDocContext`, `EditorSelectionContext`, `EditorViewContext`, React Testing Library frontend tests, Cypress component tests only where needed for rail integration.

---

## Scope

This phase implements:

- A typed frontend client for `GET /project/:Project_id/ai/config`.
- A typed frontend client for `POST /project/:Project_id/ai/chat`.
- A left rail tab named `AI Assistant`.
- A panel that shows provider/model availability, selected context state, prompt input, answer output, and context files used.
- A read-only chat flow that includes the current CodeMirror selection when available.

This phase does not implement:

- Insert or replace document actions.
- Multi-file patch preview.
- Streaming responses.
- Compile-log ingestion from the browser.
- Autonomous agent edits.

## File Structure

- Create: `services/web/frontend/js/features/ai-assistant/api.ts`
  - Typed wrappers around the backend AI config and chat endpoints.
- Create: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
  - Rail panel UI and request orchestration.
- Create: `services/web/test/frontend/features/ai-assistant/api.test.ts`
  - Unit tests for request URLs and body shape.
- Create: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
  - React tests for loading, empty provider state, selected context state, submit, answer, and error rendering.
- Modify: `services/web/frontend/js/features/ide-react/context/rail-context.tsx`
  - Add `ai-assistant` to `RailTabKey`.
- Modify: `services/web/frontend/js/features/ide-react/components/rail/rail.tsx`
  - Mount the AI rail entry with a Material icon and the new panel.
- Test: existing `services/web/test/frontend/features/ide-react/unit/toolbar.spec.tsx` if rail integration impacts shared providers.

## UI Contract

The panel uses compact editor-rail styling:

- Header: `AI Assistant` with the standard rail close button.
- Body top: provider/model selector if more than one model exists; otherwise a compact model label.
- Context strip: `Using current selection` when selected text is non-empty, otherwise `Using project context`.
- Prompt textarea: labelled `Ask about this project`.
- Submit button: `Ask`.
- Answer area: preserves whitespace and wraps long text.
- Context files: small list below the answer from `context.includedFiles`.
- Empty provider state: instructs admins to configure a provider, without exposing keys or admin-only URLs.

## Task 1: Frontend AI API Client

**Files:**
- Create: `services/web/frontend/js/features/ai-assistant/api.ts`
- Create: `services/web/test/frontend/features/ai-assistant/api.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that mock `fetch` and verify:

```ts
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import { getProjectAiConfig, sendProjectAiChat } from '../../../../frontend/js/features/ai-assistant/api'

describe('ai-assistant api', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('loads project AI config from the project endpoint', async function () {
    fetchMock.get('/project/project123/ai/config', {
      providers: [
        {
          id: 'provider-one',
          name: 'Provider One',
          models: [{ id: 'model-one', displayName: 'Model One', enabled: true }],
          defaultModel: 'model-one',
        },
      ],
    })

    const config = await getProjectAiConfig('project123')

    expect(config.providers[0].id).to.equal('provider-one')
    expect(fetchMock.callHistory.called('/project/project123/ai/config')).to.equal(true)
  })

  it('sends prompt, model, provider, and selection to the chat endpoint', async function () {
    fetchMock.post('/project/project123/ai/chat', {
      answer: 'Use \\\\cite{} here.',
      providerId: 'provider-one',
      model: 'model-one',
      context: {
        includedFiles: ['main.tex'],
        selectionIncluded: true,
        truncated: false,
      },
    })

    const response = await sendProjectAiChat('project123', {
      prompt: 'How should I cite this?',
      providerId: 'provider-one',
      model: 'model-one',
      selection: {
        docId: 'doc-one',
        path: 'main.tex',
        text: 'selected text',
      },
    })

    const call = fetchMock.callHistory.lastCall('/project/project123/ai/chat')
    expect(response.answer).to.equal('Use \\\\cite{} here.')
    expect(JSON.parse(call!.options.body as string)).to.deep.equal({
      prompt: 'How should I cite this?',
      providerId: 'provider-one',
      model: 'model-one',
      selection: {
        docId: 'doc-one',
        path: 'main.tex',
        text: 'selected text',
      },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
corepack yarn run test:frontend test/frontend/features/ai-assistant/api.test.ts
```

Expected: FAIL because `api.ts` does not exist.

- [ ] **Step 3: Implement minimal API client**

Create `api.ts` with:

```ts
import { getJSON, postJSON } from '@/infrastructure/fetch-json'

export type AiProviderModel = {
  id: string
  displayName: string
  enabled: boolean
}

export type ProjectAiProvider = {
  id: string
  name: string
  models: AiProviderModel[]
  defaultModel: string | null
}

export type ProjectAiConfig = {
  providers: ProjectAiProvider[]
}

export type ProjectAiSelection = {
  docId: string
  path: string
  text: string
}

export type ProjectAiChatRequest = {
  prompt: string
  providerId?: string
  model?: string
  selection?: ProjectAiSelection
}

export type ProjectAiChatResponse = {
  answer: string
  providerId: string
  model: string
  context: {
    includedFiles: string[]
    selectionIncluded: boolean
    truncated: boolean
  }
}

export function getProjectAiConfig(projectId: string) {
  return getJSON<ProjectAiConfig>(`/project/${projectId}/ai/config`)
}

export function sendProjectAiChat(
  projectId: string,
  body: ProjectAiChatRequest
) {
  return postJSON<ProjectAiChatResponse>(`/project/${projectId}/ai/chat`, {
    body,
  })
}
```

- [ ] **Step 4: Verify tests pass**

Run the same targeted frontend test and expect PASS.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/frontend/js/features/ai-assistant/api.ts services/web/test/frontend/features/ai-assistant/api.test.ts
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add editor ai api client"
git push origin chore/remove-commercial-code
```

## Task 2: AI Assistant Rail Panel

**Files:**
- Create: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Create: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`

- [ ] **Step 1: Write failing panel tests**

Test the component through `renderWithEditorContext`:

- Shows loading state, then configured model.
- Shows empty-provider state when `providers` is empty.
- Sends prompt with current selected text when `EditorSelectionContext` and `EditorViewContext` expose a non-empty selection.
- Renders answer and included context files.
- Renders a user-facing error on failed chat request.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
corepack yarn run test:frontend test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement minimal panel**

Use:

- `useProjectContext()` for `projectId`.
- `useEditorOpenDocContext()` for `currentDocumentId` and `openDocName`.
- `useEditorSelectionContext()` plus `useEditorViewContext()` to derive selected text from `view.state.sliceDoc(from, to)`.
- `getProjectAiConfig()` on mount.
- `sendProjectAiChat()` on submit.
- `RailPanelHeader` for header and close behavior.

Do not write to CodeMirror in this task.

- [ ] **Step 4: Verify panel tests pass**

Run the same targeted frontend test and expect PASS.

- [ ] **Step 5: Commit and push**

```bash
git add services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: add editor ai assistant panel"
git push origin chore/remove-commercial-code
```

## Task 3: Mount AI Assistant In The Rail

**Files:**
- Modify: `services/web/frontend/js/features/ide-react/context/rail-context.tsx`
- Modify: `services/web/frontend/js/features/ide-react/components/rail/rail.tsx`
- Create or modify: `services/web/test/frontend/features/ide-react/components/rail-ai-assistant.spec.tsx`

- [ ] **Step 1: Write failing rail integration test**

Mount `RailLayout` with editor providers and assert a tab button named `AI Assistant` exists. Click it and assert the panel header appears.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
corepack yarn run cypress:run --component --spec test/frontend/features/ide-react/components/rail-ai-assistant.spec.tsx
```

Expected: FAIL because the tab key and entry are not mounted.

- [ ] **Step 3: Add rail tab key and entry**

Add `'ai-assistant'` to `RailTabKey`, import `AiAssistantPanel`, and insert a rail element:

```ts
{
  key: 'ai-assistant',
  icon: 'auto_awesome',
  title: 'AI Assistant',
  component: <AiAssistantPanel />,
}
```

- [ ] **Step 4: Verify rail integration**

Run the same Cypress component test and expect PASS.

- [ ] **Step 5: Browser verification**

With the Docker/dev server running, open the editor in the browser, click the AI rail tab, and verify:

- The tab is visible in the left rail.
- The panel opens without console errors.
- Empty provider state appears when no provider is configured.
- If a provider exists, sending a prompt calls `/project/:id/ai/chat`.

- [ ] **Step 6: Commit and push**

```bash
git add services/web/frontend/js/features/ide-react/context/rail-context.tsx services/web/frontend/js/features/ide-react/components/rail/rail.tsx services/web/test/frontend/features/ide-react/components/rail-ai-assistant.spec.tsx
git diff --staged
git diff --staged | rg -i "(password|secret|api[_-]?key|token|sk-)\\s*[:=]\\s*['\\\"]?[^<\\s]" || true
git commit -m "feat: mount ai assistant rail tab"
git push origin chore/remove-commercial-code
```

## Final Verification

Run:

```bash
cd services/web
corepack yarn run test:frontend test/frontend/features/ai-assistant/api.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
corepack yarn run test:unit:parallel test/unit/src/AiAssistant/*.test.mjs
corepack yarn run precompile-pug
```

Then check:

```bash
git status --short
git log --oneline -5
```

Do not claim the UI is browser-verified unless the editor was opened and inspected through Browser Use or Chrome DevTools MCP in this session.
