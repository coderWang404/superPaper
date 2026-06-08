# Agent Per-Hunk Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selected-hunk apply, reject, and rollback for Agent patches while preserving the existing patch-level workflow.

**Architecture:** Extend `AgentPatch` operations with stable operation ids, hunk metadata, hunk statuses, and hunk-aware rollback entries. Keep current patch-level endpoints and route selected-hunk behavior through optional request bodies, with backend preflight before any write.

**Tech Stack:** Node.js/Express, Mongoose, Zod, Mocha/Chai/Sinon, React/TypeScript, fetch-mock.

---

## File Structure

- Modify: `services/web/app/src/models/AgentPatch.mjs`
  - Add `partially_applied` to allowed patch statuses.
- Modify: `services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs`
  - Add operation id normalization, hunk generation, selected apply/reject/rollback, hunk conflict handling, public serialization, and hunk-aware events.
- Modify: `services/web/app/src/Features/AiAgent/AiAgentController.mjs`
  - Parse optional `hunkIds` and `rejectUnselected` for apply/reject/rollback requests and pass them to the manager.
- Modify: `services/web/frontend/js/features/ai-agent/api.ts`
  - Add selected-hunk request body support for patch helpers.
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
  - Render hunk checkboxes, statuses, selected apply/reject/rollback actions, and conflict messages.
- Modify: `services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs`
  - Cover stable hunk ids, selected apply, partial rollback, dependencies, and conflicts.
- Modify: `services/web/test/unit/src/AiAgent/AiAgentController.test.mjs`
  - Cover request validation and manager call shapes.
- Modify: `services/web/test/frontend/features/ai-agent/api.test.ts`
  - Cover selected-hunk helper bodies and patch-level compatibility.
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
  - Cover hunk selection UI and safe error display.

## Task 1: Backend Hunk Serialization

**Files:**
- Modify: `services/web/app/src/models/AgentPatch.mjs`
- Modify: `services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs`
- Test: `services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs`

- [ ] **Step 1: Add failing tests for stable hunk ids**

Add these tests near the existing patch creation tests:

```js
it('returns stable hunk ids for pending text patches', async function (ctx) {
  const patch = await ctx.PatchManager.createPatch({
    projectId: 'project-one',
    userId: 'user-one',
    sessionId: 'session-one',
    summary: 'Update intro',
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'Old sentence.',
        newText: 'New sentence.',
      },
    ],
  })

  const firstPublicPatch = ctx.PatchManager.publicPatch(ctx.patchDocument)
  const secondPublicPatch = ctx.PatchManager.publicPatch(ctx.patchDocument)

  expect(patch.operations[0].id).to.equal('op-0001')
  expect(patch.operations[0].hunks).to.have.length(1)
  expect(patch.operations[0].hunks[0].id).to.match(
    /^op-0001:h-0001:[a-f0-9]{12}$/
  )
  expect(secondPublicPatch.operations[0].hunks[0].id).to.equal(
    firstPublicPatch.operations[0].hunks[0].id
  )
})

it('represents structural operations as single hunks', async function (ctx) {
  const patch = await ctx.PatchManager.createPatch({
    projectId: 'project-one',
    userId: 'user-one',
    sessionId: 'session-one',
    operations: [
      {
        type: 'create_doc',
        path: '/appendix.tex',
        content: 'Appendix text',
      },
    ],
  })

  expect(patch.operations[0]).to.include({
    id: 'op-0001',
    status: 'pending',
  })
  expect(patch.operations[0].hunks[0]).to.include({
    operationId: 'op-0001',
    operationIndex: 0,
    hunkIndex: 0,
    type: 'create_doc',
    path: '/appendix.tex',
    status: 'pending',
    oldText: '',
    newText: 'Appendix text',
  })
})
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentPatchManager.test.mjs --grep "stable hunk ids|structural operations"
```

Expected: both tests fail because operations do not have `id` or `hunks`.

- [ ] **Step 3: Add schema status and hunk serialization**

In `AgentPatch.mjs`, add `partially_applied` to the status enum.

In `AiAgentPatchManager.mjs`, add helpers equivalent to:

```js
function operationIdForIndex(index) {
  return `op-${String(index + 1).padStart(4, '0')}`
}

function hunkIdFor({ patch, operation, operationIndex, hunk, hunkIndex }) {
  const operationId = operation.id || operationIdForIndex(operationIndex)
  const patchId = patch._id?.toString?.() || patch.id || 'new'
  const content = [
    patchId,
    operationId,
    operation.type,
    operation.path || '',
    operation.newPath || '',
    hunk.oldStart,
    hunk.oldLines,
    hunk.newStart,
    hunk.newLines,
    hunk.oldText || '',
    hunk.newText || '',
  ].join('\u001f')
  return `${operationId}:h-${String(hunkIndex + 1).padStart(4, '0')}:${sha256(
    content
  ).slice(0, 12)}`
}

function withOperationIds(operations) {
  return operations.map((operation, index) => ({
    ...operation,
    id: operation.id || operationIdForIndex(index),
    status: operation.status || 'pending',
  }))
}
```

After `AgentPatch.create`, assign operation ids and hunks using the saved patch id, then save once:

```js
patch.operations = withOperationIds(patch.operations).map((operation, index) =>
  withHunks({ patch, operation, operationIndex: index })
)
await patch.save()
```

`withHunks` should return existing hunks when present, otherwise derive one hunk from the operation. For `replace_text`, the hunk uses `oldText`, `newText`, `baseSha256`, `proposedSha256`, and `operation.diff`. For structural operations, derive `oldText`/`newText` as described in the spec.

- [ ] **Step 4: Run hunk serialization tests**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentPatchManager.test.mjs --grep "stable hunk ids|structural operations"
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/web/app/src/models/AgentPatch.mjs services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs
git commit -m "feat(ai): serialize agent patch hunks"
```

Do not push from this task unless the caller explicitly allows pushing.

## Task 2: Selected-Hunk Apply

**Files:**
- Modify: `services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs`
- Test: `services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs`

- [ ] **Step 1: Add failing selected-apply tests**

Add:

```js
it('applies only selected hunks and leaves other hunks pending', async function (ctx) {
  ctx.docs['/main.tex'].lines = [
    'First old sentence.',
    '',
    'Second old sentence.',
  ]
  const created = await ctx.PatchManager.createPatch({
    projectId: 'project-one',
    userId: 'user-one',
    sessionId: 'session-one',
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'First old sentence.',
        newText: 'First new sentence.',
      },
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'Second old sentence.',
        newText: 'Second new sentence.',
      },
    ],
  })
  const selectedHunkId = created.operations[0].hunks[0].id

  const patch = await ctx.PatchManager.applyPatch({
    projectId: 'project-one',
    userId: 'reviewer-one',
    patchId: 'patch-one',
    hunkIds: [selectedHunkId],
  })

  expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.have.been
    .calledOnce
  expect(ctx.DocumentUpdaterHandler.promises.setDocument.firstCall.args[3]).to.deep.equal([
    'First new sentence.',
    '',
    'Second old sentence.',
  ])
  expect(patch.status).to.equal('partially_applied')
  expect(patch.operations[0].hunks[0].status).to.equal('applied')
  expect(patch.operations[1].hunks[0].status).to.equal('pending')
  expect(ctx.patchDocument.rollbackOperations[0]).to.include({
    hunkId: selectedHunkId,
    operationId: 'op-0001',
  })
})

it('rejects unknown hunk ids before applying writes', async function (ctx) {
  await ctx.PatchManager.createPatch({
    projectId: 'project-one',
    userId: 'user-one',
    sessionId: 'session-one',
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'Old sentence.',
        newText: 'New sentence.',
      },
    ],
  })

  await expect(
    ctx.PatchManager.applyPatch({
      projectId: 'project-one',
      userId: 'reviewer-one',
      patchId: 'patch-one',
      hunkIds: ['op-9999:h-0001:missing'],
    })
  ).to.be.rejectedWith(ctx.PatchManager.AiAgentPatchError)
  expect(ctx.DocumentUpdaterHandler.promises.setDocument).to.not.have.been
    .called
})
```

- [ ] **Step 2: Run selected-apply tests**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentPatchManager.test.mjs --grep "selected hunks|unknown hunk"
```

Expected: fail because `applyPatch` ignores `hunkIds`.

- [ ] **Step 3: Implement selected apply preflight and status updates**

Change `applyPatch` signature to accept `hunkIds = null` and `rejectUnselected = false`.

Add helpers:

```js
function selectedHunkSetOrNull(hunkIds) {
  if (hunkIds == null) return null
  const unique = new Set(hunkIds)
  if (unique.size !== hunkIds.length) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_DUPLICATE_HUNK',
      'Agent patch hunk ids must be unique'
    )
  }
  return unique
}

function collectPatchHunks(patch) {
  const hunks = []
  ;(patch.operations || []).forEach((operation, operationIndex) => {
    const normalizedOperation = {
      ...operation,
      id: operation.id || operationIdForIndex(operationIndex),
    }
    for (const hunk of normalizedOperation.hunks || []) {
      hunks.push({ operation: normalizedOperation, hunk })
    }
  })
  return hunks
}

function assertRequestedHunksExist(patch, selectedIds) {
  if (!selectedIds) return
  const existing = new Set(collectPatchHunks(patch).map(({ hunk }) => hunk.id))
  for (const hunkId of selectedIds) {
    if (!existing.has(hunkId)) {
      throw new AiAgentPatchError(
        'AGENT_PATCH_HUNK_NOT_FOUND',
        'Agent patch hunk was not found'
      )
    }
  }
}
```

Refactor operation apply functions so a selected text hunk can reuse the same conflict checks and document write path. For the initial implementation, a text hunk maps to the existing `replace_text` operation shape. Update hunk statuses and patch status after writes:

```js
function updatePatchStatusFromHunks(patch) {
  const statuses = collectPatchHunks(patch).map(({ hunk }) => hunk.status)
  if (statuses.every(status => status === 'rejected')) patch.status = 'rejected'
  else if (statuses.every(status => status === 'rolled_back')) patch.status = 'rolled_back'
  else if (statuses.some(status => status === 'applied')) patch.status = statuses.every(status => status === 'applied') ? 'applied' : 'partially_applied'
  else if (statuses.some(status => status === 'conflicted')) patch.status = statuses.every(status => status === 'conflicted') ? 'conflicted' : 'pending'
  else patch.status = 'pending'
}
```

- [ ] **Step 4: Run selected apply tests**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentPatchManager.test.mjs --grep "selected hunks|unknown hunk|applies a pending patch"
```

Expected: selected apply passes and existing patch-level apply still passes.

- [ ] **Step 5: Commit**

```bash
git add services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs
git commit -m "feat(ai): apply selected agent hunks"
```

## Task 3: Selected Reject And Rollback

**Files:**
- Modify: `services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs`
- Test: `services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs`

- [ ] **Step 1: Add failing reject and rollback tests**

Add:

```js
it('rejects selected pending hunks without completing other pending hunks', async function (ctx) {
  const created = await ctx.PatchManager.createPatch({
    projectId: 'project-one',
    userId: 'user-one',
    sessionId: 'session-one',
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'Old sentence.',
        newText: 'New sentence.',
      },
      {
        type: 'create_doc',
        path: '/appendix.tex',
        content: 'Appendix',
      },
    ],
  })

  const patch = await ctx.PatchManager.rejectPatch({
    projectId: 'project-one',
    userId: 'reviewer-one',
    patchId: 'patch-one',
    hunkIds: [created.operations[0].hunks[0].id],
  })

  expect(patch.status).to.equal('pending')
  expect(patch.operations[0].hunks[0].status).to.equal('rejected')
  expect(patch.operations[1].hunks[0].status).to.equal('pending')
})

it('rolls back selected hunks and leaves other applied hunks applied', async function (ctx) {
  ctx.docs['/main.tex'].lines = ['First old sentence.', 'Second old sentence.']
  const created = await ctx.PatchManager.createPatch({
    projectId: 'project-one',
    userId: 'user-one',
    sessionId: 'session-one',
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'First old sentence.',
        newText: 'First new sentence.',
      },
      {
        type: 'replace_text',
        path: '/main.tex',
        oldText: 'Second old sentence.',
        newText: 'Second new sentence.',
      },
    ],
  })
  const firstHunkId = created.operations[0].hunks[0].id

  await ctx.PatchManager.applyPatch({
    projectId: 'project-one',
    userId: 'reviewer-one',
    patchId: 'patch-one',
  })
  ctx.docs['/main.tex'].lines = ['First new sentence.', 'Second new sentence.']

  const patch = await ctx.PatchManager.rollbackPatch({
    projectId: 'project-one',
    userId: 'reviewer-one',
    patchId: 'patch-one',
    hunkIds: [firstHunkId],
  })

  expect(ctx.DocumentUpdaterHandler.promises.setDocument.lastCall.args[3]).to.deep.equal([
    'First old sentence.',
    'Second new sentence.',
  ])
  expect(patch.status).to.equal('partially_applied')
  expect(patch.operations[0].hunks[0].status).to.equal('rolled_back')
  expect(patch.operations[1].hunks[0].status).to.equal('applied')
})
```

- [ ] **Step 2: Run reject and rollback tests**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentPatchManager.test.mjs --grep "rejects selected|rolls back selected"
```

Expected: fail because reject/rollback do not accept `hunkIds`.

- [ ] **Step 3: Implement selected reject and selected rollback**

Change signatures:

```js
export async function rejectPatch({ projectId, userId, patchId, hunkIds = null }) {}
export async function rollbackPatch({ projectId, userId, patchId, hunkIds = null }) {}
```

Reject:

- If `hunkIds` is omitted, keep current patch-level behavior.
- If present, only mark pending selected hunks as `rejected`.
- Throw `AGENT_PATCH_HUNK_NOT_PENDING` if any selected hunk is not pending.
- Record `approval_response` with `hunkIds`.

Rollback:

- If `hunkIds` is omitted, keep current full rollback behavior.
- If present, filter `rollbackOperations` to selected hunk ids, reverse by `appliedOrder`, and run the existing rollback safety checks on those operations only.
- Mark selected hunks as `rolled_back`.
- Return `422 AGENT_PATCH_HUNK_DEPENDENCY` when rolling back an earlier hunk would leave a later applied hunk that depends on it.

- [ ] **Step 4: Run full patch manager suite**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentPatchManager.test.mjs
```

Expected: all patch manager tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/web/app/src/Features/AiAgent/AiAgentPatchManager.mjs services/web/test/unit/src/AiAgent/AiAgentPatchManager.test.mjs
git commit -m "feat(ai): reject and roll back selected hunks"
```

## Task 4: Controller Validation

**Files:**
- Modify: `services/web/app/src/Features/AiAgent/AiAgentController.mjs`
- Test: `services/web/test/unit/src/AiAgent/AiAgentController.test.mjs`

- [ ] **Step 1: Add failing controller tests**

Add:

```js
it('passes selected hunk ids to patch apply', async function (ctx) {
  ctx.req.params.patchId = 'patch-one'
  ctx.req.body = {
    hunkIds: ['op-0001:h-0001:abcdefabcdef'],
    rejectUnselected: true,
  }

  await ctx.Controller.applyPatch(ctx.req, ctx.res, ctx.next)

  expect(ctx.PatchManager.applyPatch).to.have.been.calledWith({
    projectId: 'project-id',
    userId: 'user-id',
    patchId: 'patch-one',
    hunkIds: ['op-0001:h-0001:abcdefabcdef'],
    rejectUnselected: true,
  })
})

it('rejects malformed hunk id request bodies', async function (ctx) {
  ctx.req.params.patchId = 'patch-one'
  ctx.req.body = { hunkIds: ['', 'x'] }

  await ctx.Controller.applyPatch(ctx.req, ctx.res, ctx.next)

  expect(ctx.res.status).to.have.been.calledWith(422)
  expect(jsonBody(ctx.res)).to.deep.equal({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid agent input',
    },
  })
  expect(ctx.PatchManager.applyPatch).to.not.have.been.called
})
```

- [ ] **Step 2: Run controller tests**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentController.test.mjs --grep "selected hunk|malformed hunk"
```

Expected: fail because the controller ignores the body.

- [ ] **Step 3: Add Zod request schemas**

Add:

```js
const HunkSelectionSchema = z.object({
  hunkIds: z
    .array(z.string().trim().min(1).max(160))
    .nonempty()
    .optional(),
  rejectUnselected: z.boolean().optional().default(false),
})

const HunkRollbackSchema = z.object({
  hunkIds: z.array(z.string().trim().min(1).max(160)).nonempty().optional(),
})
```

Use `HunkSelectionSchema.parse(req.body || {})` in `applyPatch` and `rejectPatch`; use `HunkRollbackSchema` in `rollbackPatch`.

- [ ] **Step 4: Run controller tests**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentController.test.mjs --grep "patch"
```

Expected: controller patch tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/web/app/src/Features/AiAgent/AiAgentController.mjs services/web/test/unit/src/AiAgent/AiAgentController.test.mjs
git commit -m "feat(ai): validate selected hunk patch requests"
```

## Task 5: Frontend API And Review UI

**Files:**
- Modify: `services/web/frontend/js/features/ai-agent/api.ts`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Test: `services/web/test/frontend/features/ai-agent/api.test.ts`
- Test: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`

- [ ] **Step 1: Add failing frontend API tests**

In `ai-agent/api.test.ts`, add tests that call `applyProjectAiAgentPatch('project123', 'patch-one', { hunkIds: ['op-0001:h-0001:abcdefabcdef'] })` and assert the request body equals:

```json
{"hunkIds":["op-0001:h-0001:abcdefabcdef"]}
```

Also keep the existing patch-level test expecting `{}` when the third argument is omitted.

- [ ] **Step 2: Add failing UI selection test**

In `ai-assistant-panel.test.tsx`, add a patch fixture with `operations[0].hunks`. Render the panel, check the first hunk checkbox, click "Apply selected", and assert:

```js
expect(JSON.parse(applyCall.options.body as string)).to.deep.equal({
  hunkIds: ['op-0001:h-0001:abcdefabcdef'],
})
```

- [ ] **Step 3: Run failing frontend tests**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-agent/api.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "hunk|selected"
```

Expected: fail because helpers and UI do not support hunk selections.

- [ ] **Step 4: Implement frontend request types and UI**

In `features/ai-agent/api.ts`, add:

```ts
export type AgentPatchSelectionRequest = {
  hunkIds?: string[]
  rejectUnselected?: boolean
}
```

Update apply/reject/rollback helpers to send `selection ?? {}`.

In `AgentPatchCard`, add selected state:

```ts
const [selectedHunkIds, setSelectedHunkIds] = useState<Set<string>>(
  () => new Set()
)
```

Render hunks when present:

```tsx
{operation.hunks?.map(hunk => (
  <label className="ai-assistant-agent-patch-hunk" key={hunk.id}>
    <input
      checked={selectedHunkIds.has(hunk.id)}
      disabled={busy || hunk.status !== 'pending'}
      type="checkbox"
      onChange={event => toggleSelectedHunk(hunk.id, event.currentTarget.checked)}
    />
    <span>{operation.path}</span>
    <span>{formatPatchStatus(hunk.status, t)}</span>
    <pre className="ai-assistant-agent-patch-diff">
      {hunk.diff.lines.map((line, index) => (
        <PatchDiffLine key={`${hunk.id}-${index}`} line={line} />
      ))}
    </pre>
  </label>
))}
```

Add selected action handlers:

```ts
const selectedRequest = () => ({ hunkIds: Array.from(selectedHunkIds) })
```

Call `applyProjectAiAgentPatch(projectId, patch.id, selectedRequest())` for "Apply selected".

- [ ] **Step 5: Run frontend tests**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-agent/api.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx --grep "patch|hunk|selected"
```

Expected: frontend API and UI tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/web/frontend/js/features/ai-agent/api.ts services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx services/web/test/frontend/features/ai-agent/api.test.ts services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
git commit -m "feat(ai): add hunk-level patch review UI"
```

## Task 6: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted backend tests**

```bash
cd services/web
yarn test:unit test/unit/src/AiAgent/AiAgentPatchManager.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run targeted frontend tests**

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-agent/api.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Run lint and diff checks**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js app/src/Features/AiAgent/AiAgentPatchManager.mjs app/src/Features/AiAgent/AiAgentController.mjs frontend/js/features/ai-agent/api.ts frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/unit/src/AiAgent/AiAgentPatchManager.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/frontend/features/ai-agent/api.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
git diff --check
```

Expected: exit code 0.

- [ ] **Step 4: Commit verification notes if the project uses plan closeout edits**

If implementation workers update this plan with results, append exact commands and outcomes under a `## Verification Results` heading and commit that documentation change separately.
