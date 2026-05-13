# superPaper AI Assistant Design

## Goal

Add first-party AI capabilities to superPaper without reintroducing commercial
SaaS code or bypassing the existing editor, collaboration, compile, history,
file, and Git workflows.

## Current Product Context

The live editor is a three-column workspace:

- Left rail: file tree, project search, integrations, collaborator chat, help,
  and settings.
- Center: CodeMirror source editor with exposed `EditorViewContext` and
  `EditorSelectionContext`.
- Right: PDF preview and compile log tabs.

The best first-class AI surface is a new left rail tab. Admin provider
configuration belongs in the existing server admin area, which currently uses
Pug-rendered pages.

## Non-Goals

- Do not add billing, subscriptions, SaaS analytics, Writefull, or other
  vendor-specific commercial shells.
- Do not replace the collaboration stack.
- Do not let AI write directly to MongoDB or docstore.
- Do not implement autonomous project-wide writes without explicit user review
  in the first release.

## Architecture

The first implementation stays inside `services/web` as a focused
`AiAssistant` feature. This keeps authentication, project authorization, CSRF,
editor metadata, and browser integration close to existing patterns.

Main units:

- `AiProvider` model: stores provider metadata, encrypted API key, discovered
  models, default model, health state, and audit timestamps.
- Admin AI controller/manager: validates admin input, encrypts keys, tests
  providers, and syncs model lists.
- AI gateway: creates provider clients from stored config and exposes a narrow
  internal interface for chat, model sync, and future tool calls.
- Project context builder: collects current project files, current document,
  current selection, compile logs, and user prompt into a bounded context.
- Editor AI rail tab: streams answers, shows selected-context state, and offers
  insert/replace/diff actions.

## Provider Contract

Initial provider support targets OpenAI-compatible APIs:

- Admin enters `name`, `baseURL`, and `apiKey`.
- Server tests the provider with a lightweight request.
- Server syncs models from `GET {baseURL}/models` when available.
- Admin can manually add model IDs when the provider does not expose a standard
  model list.

Provider secrets are encrypted at rest. API keys are never returned to the
browser after creation or update.

## API Shape

Admin endpoints:

```text
GET    /admin/ai/providers
POST   /admin/ai/providers
PATCH  /admin/ai/providers/:providerId
DELETE /admin/ai/providers/:providerId
POST   /admin/ai/providers/:providerId/sync-models
POST   /admin/ai/providers/:providerId/test
```

Editor endpoints:

```text
GET  /project/:Project_id/ai/config
POST /project/:Project_id/ai/chat
POST /project/:Project_id/ai/suggest-edit
```

All endpoints validate input at the route boundary and use structured error
responses for JSON APIs.

## Context Strategy

First release uses deterministic project snapshots instead of a vector store:

1. Current selected text, if any.
2. Current open document around the cursor.
3. Root document.
4. Other `.tex`, `.bib`, `.cls`, and `.sty` documents up to a token budget.
5. Compile log excerpts when the user asks about errors.

The context builder records which files were included so the UI can explain the
scope of an answer without exposing hidden internals.

## Editing Strategy

There are three write levels:

1. **Answer only:** no document change.
2. **Local insert/replace:** user clicks an explicit action in the AI panel;
   the frontend applies the edit through CodeMirror so collaboration and undo
   semantics remain intact.
3. **Patch preview:** AI returns structured file patches; the UI shows a diff;
   accepted patches are applied through the editor/document update workflow.

First release implements levels 1 and 2. Level 3 follows once provider
management and contextual chat are stable.

## Security

- Admin provider management requires site admin access.
- Project AI endpoints require normal project read access; edit suggestions
  require write access only when applying edits.
- API keys are encrypted at rest and redacted in logs.
- Third-party model responses are treated as untrusted content.
- Prompt/context data stays server-side except for the explicit project content
  the user is already allowed to read.
- AI usage is rate-limited per user and project.

## Verification

- Backend unit tests cover provider validation, secret redaction, model sync
  response parsing, and project context selection.
- Frontend tests cover rail tab rendering, selection detection, and insert or
  replace actions.
- Browser verification covers admin provider setup and editor AI rail flows.
- Existing editor compile/collaboration behavior must remain usable after the
  AI rail is enabled.
