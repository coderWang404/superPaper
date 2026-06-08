# Agent Per-Hunk Approval Design

## Context

Agent mode currently creates an `AgentPatch` with patch-level `operations`, exposes a patch review card in `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`, and applies or rolls back the whole patch through:

- `POST /project/:Project_id/ai/agent/patches/:patchId/apply`
- `POST /project/:Project_id/ai/agent/patches/:patchId/reject`
- `POST /project/:Project_id/ai/agent/patches/:patchId/rollback`

The backend implementation lives in `services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs`. It already stores `baseRevision`, `operations`, `appliedOperations`, and `rollbackOperations`, marks whole patches as `conflicted`, and writes project changes through `DocumentUpdaterHandler` or `EditorController`. This design keeps those safety properties and adds a narrower approval unit: a reviewer can approve selected hunks while leaving the rest pending or rejected.

## Goals

- Let reviewers apply only selected hunks from an agent proposal.
- Keep stable hunk ids so UI selections remain valid across rendering, event replay, and apply requests.
- Preserve the existing patch-level apply/reject/rollback endpoints for compatibility.
- Keep all writes on the existing collaboration-safe paths. No model output writes directly to MongoDB, docstore, filestore, or workspace files.
- Give partial rollback the same safety checks as full rollback.
- Report conflicts at hunk granularity without accidentally applying unrelated hunks after a conflict.

## Non-Goals

- No automatic conflict resolution or three-way merge in this phase.
- No hunk reordering or user editing of hunk contents in the approval UI.
- No per-line approval inside a hunk.
- No support for partially applying `rename_entity`, `move_entity`, or `delete_doc`; each structural operation is one hunk.

## Hunk Model

Every public patch operation gets a `hunks` array in addition to the existing `diff` field. `diff.lines` remains for older frontend code and tests until the UI fully switches to `hunks`.

```ts
type AgentPatchHunk = {
  id: string
  operationId: string
  operationIndex: number
  hunkIndex: number
  type: 'text' | 'create_doc' | 'delete_doc' | 'rename_entity' | 'move_entity'
  path: string
  newPath?: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  oldText: string
  newText: string
  baseSha256?: string
  proposedSha256?: string
  status: 'pending' | 'applied' | 'rejected' | 'conflicted' | 'rolled_back'
  appliedAt?: string | null
  rolledBackAt?: string | null
  conflict?: {
    code: 'TARGET_CHANGED' | 'TARGET_MISSING' | 'TARGET_EXISTS' | 'DEPENDENCY_NOT_APPLIED'
    message: string
  } | null
  diff: {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: Array<{ type: 'context' | 'remove' | 'add'; content: string }>
  }
}
```

`operationId` is stored on every operation. New patches receive operation ids as `op-0001`, `op-0002`, and so on. Existing patch documents without operation ids derive them from operation index during public serialization, but derived ids are not written back unless the patch is saved for apply/reject/rollback.

## Stable Hunk IDs

The stable hunk id format is:

```text
op-0001:h-0001:<content-prefix>
```

`content-prefix` is the first 12 hex characters of:

```text
sha256([
  patchId,
  operationId,
  operation.type,
  operation.path,
  operation.newPath || '',
  hunk.oldStart,
  hunk.oldLines,
  hunk.newStart,
  hunk.newLines,
  hunk.oldText,
  hunk.newText
].join('\u001f'))
```

The id is stable for a persisted patch because it is derived from patch id, operation id, paths, ranges, and hunk content. It changes only if the agent creates a new patch. The frontend must treat hunk ids as opaque strings and never reconstruct them. Backend tests should assert stability across two `publicPatch(patch)` calls and uniqueness across a patch with multiple files and multiple hunks in one file.

## Hunk Generation

`replace_text` operations can contain one or more text hunks. The initial implementation may keep one hunk per `replace_text` operation if the current `oldText`/`newText` replacement is one contiguous block. If a later patch proposal format supports multi-range text edits in one operation, each range becomes one hunk under the same operation id.

Structural operations are represented as single hunks:

- `create_doc`: `oldText` is empty, `newText` is the full file content.
- `delete_doc`: `oldText` is the full file content, `newText` is empty.
- `rename_entity`: `oldText` is the old path, `newText` is the new path.
- `move_entity`: `oldText` is the old path, `newText` is the new path.

The hunk builder should live in `AiAgentPatchManager.mjs` first to keep scope small. If it grows beyond patch manager responsibilities, split it later into `AiAgentPatchHunkBuilder.mjs`.

## Apply API

The existing patch-level endpoint remains valid:

```http
POST /project/:Project_id/ai/agent/patches/:patchId/apply
{}
```

It applies all pending hunks and preserves current behavior.

Selected-hunk apply uses the same endpoint with an explicit body:

```json
{
  "hunkIds": [
    "op-0001:h-0001:9f5f0a0df4c2",
    "op-0002:h-0001:0e9a73c67d4b"
  ],
  "rejectUnselected": false
}
```

Controller validation:

- `hunkIds` is optional for compatibility.
- If present, it must be a non-empty array of unique strings, each 1 to 160 characters.
- `rejectUnselected` defaults to `false`.
- Unknown hunk ids return `422` with `AGENT_PATCH_HUNK_NOT_FOUND`; they do not apply any hunk.
- Duplicated hunk ids return `422` with `AGENT_PATCH_DUPLICATE_HUNK`.

Backend manager signature:

```js
export async function applyPatch({
  projectId,
  userId,
  patchId,
  hunkIds = null,
  rejectUnselected = false,
}) {}
```

Response shape remains `{ patch }`. The returned patch includes operation and hunk statuses:

```json
{
  "patch": {
    "id": "patch-one",
    "status": "partially_applied",
    "operations": [
      {
        "id": "op-0001",
        "type": "replace_text",
        "path": "/main.tex",
        "status": "partially_applied",
        "hunks": [
          { "id": "op-0001:h-0001:9f5f0a0df4c2", "status": "applied" },
          { "id": "op-0001:h-0002:66b7b447c9d8", "status": "pending" }
        ]
      }
    ],
    "rollbackAvailable": true
  }
}
```

`AgentPatchSchema.status` adds `partially_applied`. Operation documents and hunk documents also store `status`; for old patches without hunk status, public serialization derives `pending`, `applied`, `rejected`, or `rolled_back` from the patch status.

## Apply Semantics

Apply is all-or-nothing for the submitted `hunkIds`. The manager first validates the patch status, hunk ids, dependencies, and current project state for every selected hunk. It only writes after preflight succeeds for the full selected set.

For one document with multiple selected text hunks:

1. Load the current doc once.
2. Verify the current doc sha matches the operation base sha if no hunk from that operation has been applied yet.
3. If some hunks from the same operation were already applied, verify the current doc sha matches the sha recorded after the last applied hunk for that operation.
4. Apply selected hunks in operation order and hunk order.
5. Record a rollback entry per hunk with before and after text snapshots for that hunk application.

For separate documents, apply in patch operation order. This matches current patch-level behavior and keeps event logs deterministic.

Structural operation hunks cannot be applied together with text hunks that depend on the old path of the same document unless the structural hunk is ordered after those text hunks. If a selection violates this dependency, preflight fails with `AGENT_PATCH_HUNK_DEPENDENCY`.

## Partial Rollback Semantics

Existing full rollback remains:

```http
POST /project/:Project_id/ai/agent/patches/:patchId/rollback
{}
```

It rolls back all applied hunks in reverse application order.

Selected-hunk rollback uses the same endpoint:

```json
{
  "hunkIds": ["op-0001:h-0001:9f5f0a0df4c2"]
}
```

Rules:

- Only `applied` hunks can be rolled back.
- Rollback order is reverse applied order, not request order.
- Rolling back a text hunk requires the document to still contain the hunk's `afterText` state at the recorded location or to match the recorded `afterSha256` for whole-doc fallback. Otherwise the hunk becomes `conflicted`, no rollback writes occur, and the endpoint returns `409`.
- Rolling back `create_doc` deletes the created doc only if the current content sha matches the recorded created content sha.
- Rolling back `delete_doc` restores the deleted doc only if the target path is still empty.
- Rolling back `rename_entity` or `move_entity` moves the entity back only if the current entity is still at the recorded new path and the old path is empty.
- If a later applied hunk depends on an earlier hunk, the earlier hunk cannot be rolled back alone. Return `422 AGENT_PATCH_HUNK_DEPENDENCY` with the dependent hunk ids.

Patch status after rollback:

- `rolled_back` when no hunks remain applied and no hunks remain pending.
- `partially_applied` when at least one hunk remains applied.
- `pending` when no hunks are applied and at least one hunk remains pending.
- `conflicted` only when a conflict prevents the requested rollback.

## Reject Semantics

Patch-level reject remains unchanged for compatibility:

```http
POST /project/:Project_id/ai/agent/patches/:patchId/reject
{}
```

Selected-hunk reject uses:

```json
{
  "hunkIds": ["op-0001:h-0002:66b7b447c9d8"]
}
```

Only pending hunks can be rejected. Rejecting selected hunks does not complete the session unless every hunk is now terminal (`applied`, `rejected`, `rolled_back`, or `conflicted`). This prevents one rejected hunk from hiding other pending review work.

## Conflict Handling

Conflict handling is conservative:

- Text hunk conflict if the target doc is missing, the base/expected sha does not match, or `oldText` cannot be found exactly once in the expected content.
- Create conflict if the path now exists as a doc or file.
- Delete conflict if the doc is missing or its content changed.
- Rename/move conflict if the source is missing, source content changed, or destination now exists.

On selected-hunk apply, any conflict aborts the entire selected set before writes. The patch is not marked fully `conflicted` unless every remaining pending hunk is conflicted. Otherwise only the conflicting hunk gets `status: 'conflicted'`, and the patch status becomes `partially_applied` or `pending` based on other hunk states.

Response status:

- `409` for project state conflicts.
- `422` for invalid hunk ids, invalid patch state, or dependency errors.

Safe response example:

```json
{
  "error": {
    "code": "AGENT_PATCH_HUNK_CONFLICT",
    "message": "Agent patch hunk target document changed",
    "hunkIds": ["op-0001:h-0001:9f5f0a0df4c2"]
  }
}
```

Do not include document contents, API keys, raw prompts, cookies, or model provider errors in conflict responses.

## Events And Audit Trail

Keep existing event types and add hunk metadata:

- `approval_response`: include `{ patchId, status, hunkIds, rejectUnselected }`.
- `patch_applied`: include `{ patchId, hunkIds, operations }`.
- `patch_rejected`: include `{ patchId, hunkIds }`.
- `patch_rolled_back`: include `{ patchId, hunkIds, operations }`.

Patch-level actions can omit `hunkIds` or include all affected hunk ids. New frontend code should prefer explicit `hunkIds` when present.

## Frontend Design

`AgentPatchCard` changes from patch-level buttons only to hunk selection plus bulk actions.

UI behavior:

- Each hunk renders a checkbox, file path, concise range label, status badge, and diff lines.
- Pending hunks are selectable.
- Applied hunks are not selectable for apply, but are selectable in rollback mode.
- Conflicted hunks show a conflict badge and the safe message from the backend.
- The existing "Apply patch" button remains and applies all pending hunks.
- Add "Apply selected" when at least one pending hunk is selected.
- Add "Reject selected" when at least one pending hunk is selected.
- Keep "Rollback patch" for all applied hunks, and add "Rollback selected" when in applied-hunk selection mode.

The frontend API helpers in `services/web/frontend/js/features/ai-agent/api.ts` should accept optional bodies:

```ts
type AgentPatchSelectionRequest = {
  hunkIds?: string[]
  rejectUnselected?: boolean
}

applyProjectAiAgentPatch(projectId, patchId, selection?)
rejectProjectAiAgentPatch(projectId, patchId, selection?)
rollbackProjectAiAgentPatch(projectId, patchId, selection?)
```

The existing tests that assert `{}` request bodies should be updated to assert `{}` only for patch-level actions and explicit `hunkIds` for selected actions.

## Data Migration And Compatibility

No database migration is required before deploy. Existing pending patches without `operation.id` or `hunks` are serialized with derived ids and one derived hunk per operation. When any old patch is applied, rejected, or rolled back, save the derived operation ids and hunk statuses as part of the normal patch save.

Schema changes:

- Add `partially_applied` to `AgentPatchSchema.status`.
- Continue storing `operations` as an array to avoid a broad schema migration.
- Add optional `operation.id`, `operation.status`, and `operation.hunks`.
- Keep `rollbackOperations` and extend entries with `hunkId`, `operationId`, and `appliedOrder`.

## Tests

Backend unit tests in `services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs`:

- Creates stable hunk ids and returns identical ids across repeated public serialization.
- Applies only selected text hunks and leaves unselected hunks pending.
- Applies all pending hunks when `hunkIds` is omitted.
- Rejects unknown and duplicate hunk ids before writes.
- Marks a selected hunk conflicted and writes nothing when the target doc changed.
- Rolls back a selected text hunk without rolling back other applied hunks.
- Blocks rollback of a hunk that has later dependent applied hunks.
- Treats create/delete/rename/move as one structural hunk and preserves existing rollback safety.

Controller tests in `services/web/test/unit/src/AiAgent/AiAgentController.test.mjs`:

- Passes `hunkIds` and `rejectUnselected` to `applyPatch`.
- Validates malformed `hunkIds` with `422 VALIDATION_ERROR`.
- Maps hunk conflict errors to `409`.

Frontend tests in `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` and `services/web/test/frontend/features/ai-agent/api.test.ts`:

- Renders hunk checkboxes and sends selected hunk ids on apply.
- Keeps patch-level apply request compatible with `{}`.
- Disables selected actions for applied/rejected/conflicted hunks.
- Shows safe conflict text without rendering document content from an error response.

## Rollout

1. Backend-compatible rollout: add hunk ids/statuses to public patch payloads while preserving patch-level apply/reject/rollback.
2. Frontend rollout: render hunk-level UI when `operation.hunks` is present; fall back to current operation diff UI otherwise.
3. Selected action rollout: enable selected apply/reject/rollback after backend tests and frontend tests pass.
4. Cleanup: after at least one release cycle, remove frontend fallback paths only if telemetry and support logs show no old patch payloads in active sessions.

Deployment risk is low to medium. The risky part is partial write ordering, so implementation must keep selected apply preflight all-or-nothing and preserve the existing full-patch path until hunk behavior is proven.
