# Cline Primary Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cline the default superPaper project agent runtime by preparing a filesystem workspace for Mongo-backed projects before each agent run.

**Architecture:** The existing filesystem workspace foundation remains the canonical route. `AiAgentRuntime` stops routing normal Mongo projects to the hand-written JSON tool loop; instead it ensures the project has a filesystem workspace, then runs `ClineAgentRuntimeAdapter` with the real project workspace as `cwd`. The legacy loop remains as internal fallback code until later cleanup, but it is no longer the default route.

**Tech Stack:** Node.js ESM, Vitest, `@cline/sdk` 0.0.41, existing encrypted AI provider settings, `ProjectStorageMigrationService`, `ClineAgentRuntimeAdapter`, `AgentSession`/`AgentEvent`.

---

## Current Gap Summary

- `@cline/sdk` is installed and the primary route now uses the official `ClineCore.create(...).start(...)` session API.
- `AiAgentRuntime` now prepares a filesystem workspace for Mongo-backed projects, then runs Cline in that workspace. Normal project agent runs no longer use the custom JSON tool loop.
- Real browser testing with the configured root channel provider (`gpt-5.2`) confirmed that Cline can call `apply_patch` and directly create a file in the project workspace.
- The adapter maps superPaper AI channels onto Cline's built-in OpenAI-compatible `aihubmix` provider and overrides `baseUrl`, `apiKey`, `modelId`, and `knownModels`. Dynamic `superpaper-*` provider registration was removed because the Cline gateway rejects unknown provider ids.
- Root `zod` is pinned to `4.3.6` because Cline 0.0.41 uses `zod.fromJSONSchema`; older root resolution (`4.1.11`) breaks Cline tool schema handling.
- Frontend agent mode now starts a fresh session after a failed/cancelled turn instead of reusing an unrunnable failed session.
- The Cline adapter now normalizes Mongo `ObjectId` session ids to strings before passing them to Cline; the SDK calls `sessionId.trim()`.
- Cline-created files now refresh into the Overleaf file tree without a manual reload. The agent route starts the workspace watcher after filesystem preparation, and browser clients refresh `rootFolder` through the logged-in web `GET /project/:Project_id/file-tree` endpoint instead of the private `/project/:Project_id/join` API.
- Uploaded binary/fileRef export is covered during Mongo-to-filesystem migration. The migration test now verifies that a History blob-backed file such as `/figures/plot.pdf` is written into the workspace.
- Editor document-content live sync now refreshes an already-open document when Cline modifies that file in the workspace, while avoiding force-reopen if the current editor document still has buffered local ops.
- Runtime error observability now logs structured, secret-redacted Cline diagnostics for maintainers while keeping user-facing AgentEvent errors generic.
- 2026-05-21 hardening closed the biggest clean-route gaps: each Cline run now creates before/after checkpoints, emits workspace diff summaries, can roll back to the before checkpoint from the AI Assistant run summary, injects enabled project rules/skills/plugin ids/tool policy into Cline's system prompt, quarantines the legacy JSON tool catalog away from the primary runtime path, and handles current-document delete/rename refresh without stale force-reopens.
- 2026-05-21 SDK policy follow-up made the Cline SDK route explicit: direct workspace tools, shell, skills, and submit are enabled/auto-approved; external web fetch is disabled by default; ask-question, MCP settings tools, spawn-agent, and team tools are disabled; selected skills, workspace metadata, and `checkpoint: { enabled: false }` are passed to Cline because superPaper owns checkpointing.
- 2026-05-21 UX closeout fixed Agent composer behavior around Plan -> Act: Plan keeps the prompt available for Run, while a successful Act/Run clears the composer. Real browser context smoke with the root channel provider rendered the live runtime policy summary in the worklog and produced no workspace file changes.
- Remaining gaps: deeper Cline SDK surface area beyond the session API, especially workspace index/prewarm exposure; optional MCP settings integration if it becomes useful; richer shell/tool permission UI; and final deletion of the patch-review compatibility catalog once direct Cline + checkpoint rollback fully replaces it.

## Real Verification Snapshot

- Unit bundle: `corepack yarn --cwd services/web vitest run test/unit/src/Settings/Settings.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs` -> 5 files, 27 tests passed.
- Frontend focused component test: `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` -> 14 tests passed.
- Container Cline ObjectId reproduction: direct adapter run with Mongo `ObjectId` session id completed and returned `OBJECT_ID_SESSION_REPRO_OK`.
- Browser smoke: project `6a0da04be1d53948727c0876`, session `6a0ded5e846748143f77eff8`, provider `6a041529a131e4e686e7ee91`, model `gpt-5.2`.
  - Cline emitted `apply_patch` tool call/result.
  - Created `/var/lib/superpaper/6a0da04be1d53948727c0876/workspace/cline-direct-edit-20260520d.tex`.
  - File content: `CLINE_DIRECT_EDIT_AFTER_OBJECT_ID_FIX_OK_20260520D`.
  - Session status: `completed`.
  - `agentPatches` for the session: `0`.
- Sync verification: project `6a0da04be1d53948727c0876`, session `6a0df37e8fe32f3f839a6352`, provider `6a041529a131e4e686e7ee91`, model `gpt-5.2`.
  - Cline emitted `apply_patch` and created `/var/lib/superpaper/6a0da04be1d53948727c0876/workspace/cline-watcher-refresh-20260520b.tex`.
  - File content: `CLINE_WATCHER_REFRESH_OK_20260520B`.
  - The running browser received `project:filesystem:changed`, fetched `GET /project/6a0da04be1d53948727c0876/file-tree` with `200`, and the file tree displayed `cline-watcher-refresh-20260520b.tex`.
  - Session status: `completed`; `agentPatches` for the session: `0`.
- Latest focused test bundle:
  - `corepack yarn --cwd services/web vitest run test/unit/src/Settings/Settings.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectController.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs` -> 8 files, 133 tests passed.
  - `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` -> 15 tests passed.
  - Redis `ECONNREFUSED` noise in isolated unit runs remains pre-existing test-environment noise.
- 2026-05-21 focused follow-up:
  - `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx test/frontend/features/pdf-preview/util/compiler.test.ts test/frontend/features/ide-react/components/rail-tab.test.tsx test/frontend/features/integrations-panel/integrations-panel.test.tsx` -> 29 tests passed.
  - `corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs` -> 3 files, 20 tests passed. Redis `ECONNREFUSED` and listener warnings remain isolated unit-test environment noise.
  - `node ../../node_modules/eslint/bin/eslint.js app/src/Features/AiAgent/AiAgentRuntime.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs frontend/js/features/ide-react/hooks/use-socket-listeners.ts test/frontend/features/file-tree/filesystem-change-listener.test.tsx` -> passed.
  - `git diff --check` -> passed.
- 2026-05-21 Cline complete-route hardening:
  - `corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs` -> 5 files, 43 tests passed.
  - `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` -> 28 tests passed.
  - `node ../../node_modules/eslint/bin/eslint.js ...` over the touched backend/frontend files -> passed.
  - `corepack yarn install` -> exit 0 with existing peer warnings; root and web workspace `zod` resolve to `4.3.6`.
  - Real browser smoke with the root channel provider (`gpt-5.2`) created `browser-rollback-smoke-20260521.tex` through Cline `apply_patch`, showed the file in the browser file tree, rendered before/after checkpoint cards, then rolled back to `c1e07a6b8edba094e70bf9ca72f8ad6b07998eb6`. Rollback returned HTTP 200, emitted `checkpoint_restored`, reset the workspace HEAD to `c1e07a6`, and removed the file from the file-tree endpoint.
- 2026-05-21 Cline SDK policy and closeout:
  - `corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectController.test.mjs test/unit/src/AiAgent/AgentEventModel.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs` -> 10 files, 155 tests passed.
  - `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ide-react/components/rail-tab.test.tsx test/frontend/features/integrations-panel/integrations-panel.test.tsx test/frontend/features/pdf-preview/util/compiler.test.ts test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` -> 33 tests passed.
  - Targeted `eslint` over touched backend/frontend files -> passed.
  - `git diff --check` -> passed.
  - Real browser smoke with the root channel provider (`gpt-5.2`) on project `6a0da04be1d53948727c0876`, session `6a0f200c2515e0764612781d`, rendered `Cline runtime`, `Skills: none`, `Plugins: latex-core`, `Shell: enabled`, `External tools: disabled`, `MCP: disabled`, and `Subagents: disabled` in the expanded worklog. Before/after checkpoint cards both showed `c1e07a6b`, so the context-only run produced no workspace file changes. Screenshot: `output/playwright/superpaper-cline-runtime-context-20260521.png`.
- 2026-05-22 durable browser smoke command:
  - Added `corepack yarn --cwd services/web smoke:cline-agent-browser`, backed by Playwright and explicit `SUPERPAPER_SMOKE_EMAIL`, `SUPERPAPER_SMOKE_PASSWORD`, and `SUPERPAPER_SMOKE_PROJECT_ID` environment variables.
  - First-time browser setup uses `corepack yarn --cwd services/web playwright install chromium`.
  - Real browser smoke with the root channel provider (`gpt-5.2`) on project `6a0da04be1d53948727c0876` passed and saved `output/playwright/superpaper-cline-browser-smoke-2026-05-21T16-39-45-144Z.png`.

## Phase 1 File Structure

- Modify: `services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs`
  - Import `ProjectStorageMigrationService`.
  - Replace the `storageBackend === 'filesystem'` branch with `ensureFilesystemAgentProject`.
  - If the project is Mongo-backed, migrate it to filesystem before calling Cline.
  - Keep provider/model/session/event handling in the existing Cline wrapper.
- Modify: `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`
  - Mock `ProjectStorageMigrationService`.
  - Change the Mongo default test so Mongo projects migrate and run Cline.
  - Keep a focused legacy-loop unit test for explicit internal fallback later if needed.

## Task 1: Route Mongo Projects Through Filesystem Preparation And Cline

- [x] **Step 1: Write failing test**

In `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`, add a mock `ctx.ProjectStorageMigrationService` and a test named `migrates mongo projects before running Cline`.

Expected assertions:

```js
expect(ctx.ProjectStorageMigrationService.migrateProjectToFilesystem).to.have.been.calledWith({
  projectId: 'project-id',
  userId: 'user-id',
})
expect(ctx.ClineAgentRuntimeAdapter.runTurn).to.have.been.calledWithMatch({
  projectId: 'project-id',
  userId: 'user-id',
  sessionId: 'session-id',
  prompt: 'Update the paper',
})
expect(ctx.streamOpenAICompatibleChatCompletion).not.to.have.been.called
```

- [x] **Step 2: Run failing test**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/AiAgentRuntime.test.mjs -t "migrates mongo projects before running Cline"
```

Expected: FAIL because Mongo projects still use the legacy loop.

- [x] **Step 3: Implement route**

In `AiAgentRuntime.mjs`:

- Import `ProjectStorageMigrationService`.
- Add `ensureFilesystemAgentProject({ projectId, userId })`.
- Fetch `storageBackend`.
- If already filesystem, run Cline.
- If missing or `mongo`, call `ProjectStorageMigrationService.migrateProjectToFilesystem({ projectId, userId })`, then run Cline.
- If any other backend appears, raise `AGENT_STORAGE_BACKEND_UNSUPPORTED`.

- [x] **Step 4: Run focused tests**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/AiAgentRuntime.test.mjs
```

Expected: PASS after updating legacy expectations.

## Task 2: Preserve Provider/Session Behavior In The Cline Route

- [x] **Step 1: Adjust existing tests**

Update the old `keeps mongo projects on the legacy tool loop` and streaming-provider tests so they no longer describe default Mongo behavior. They should either be removed or renamed to explicitly cover extracted legacy fallback only if the fallback is exposed for tests.

- [x] **Step 2: Run runtime tests**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/AiAgent/AiAgentRuntime.test.mjs
```

Expected: PASS.

## Task 3: Verification Bundle

- [x] **Step 1: Run related unit tests**

Run:

```bash
corepack yarn --cwd services/web vitest run \
  test/unit/src/AiAgent/AiAgentRuntime.test.mjs \
  test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs \
  test/unit/src/Project/ProjectStorageMigrationService.test.mjs \
  test/unit/src/Project/ProjectFileStore.test.mjs \
  test/unit/src/Project/ProjectWorkspaceManager.test.mjs
```

Expected: PASS.

- [x] **Step 2: Real browser smoke**

Start the local stack if needed, open the project workbench in the in-app browser, run an Agent prompt on a Mongo-backed project, and verify the session events include Cline output rather than the old JSON tool-loop events.

## Task 4: Refresh Browser File Tree After Direct Cline Workspace Edits

- [x] **Step 1: Reproduce the real sync failure**

Run a browser Agent prompt that asks Cline to create `/cline-watcher-refresh-20260520a.tex`.

Expected failure before the fix:

- The file exists in `/var/lib/superpaper/<project-id>/workspace`.
- `ProjectWorkspaceWatcher` emits `project:filesystem:changed` through real-time.
- The browser still does not show the file in the file tree.
- Web logs show browser-origin `POST /project/:Project_id/join` returning `401`, because that route is a private API endpoint.

- [x] **Step 2: Write failing runtime watcher test**

In `services/web/test/unit/src/AiAgent/AiAgentRuntime.test.mjs`, add a test named `starts the workspace watcher after filesystem preparation so direct Cline edits refresh clients`.

Expected assertions:

```js
expect(ctx.ProjectWorkspaceWatcher.start).to.have.been.calledWith('project-id')
expect(
  ctx.ProjectWorkspaceWatcher.start.calledAfter(
    ctx.ProjectStorageMigrationService.migrateProjectToFilesystem
  )
).to.equal(true)
expect(
  ctx.ClineAgentRuntimeAdapter.runTurn.calledAfter(
    ctx.ProjectWorkspaceWatcher.start
  )
).to.equal(true)
```

- [x] **Step 3: Start watcher before Cline run**

In `services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs`, import `ProjectWorkspaceWatcher` and call `ProjectWorkspaceWatcher.start(projectId.toString())` after confirming or migrating to filesystem storage.

- [x] **Step 4: Write failing file-tree endpoint test**

In `services/web/test/unit/src/Project/ProjectController.test.mjs`, add `projectFileTreeJson` coverage proving filesystem projects return `rootFolder` rebuilt from `ProjectFileStore.listFiles()` and `ProjectEntityHandler.buildFilesystemRootFolder()`.

- [x] **Step 5: Add logged-in web file-tree endpoint**

In `services/web/app/src/Features/Project/ProjectController.mjs`, add `projectFileTreeJson`.

In `services/web/app/src/router.mjs`, add:

```js
webRouter.get(
  "/project/:Project_id/file-tree",
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanReadProject,
  ProjectController.projectFileTreeJson,
);
```

- [x] **Step 6: Switch browser socket refresh away from private join**

In `services/web/frontend/js/features/ide-react/hooks/use-socket-listeners.ts`, replace the `postJSON('/project/:id/join')` refresh with `getJSON('/project/:id/file-tree')`, then call `updateProject({ rootFolder })`.

Update `services/web/test/frontend/features/file-tree/filesystem-change-listener.test.tsx` to prove the listener calls `GET /project/project123/file-tree` and does not call `/project/project123/join`.

- [x] **Step 7: Verify with tests and real browser**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/Settings/Settings.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectController.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
```

Then run a real browser Agent prompt that creates `/cline-watcher-refresh-20260520b.tex` and verify:

- file content is `CLINE_WATCHER_REFRESH_OK_20260520B`;
- session `6a0df37e8fe32f3f839a6352` completed;
- `agentPatches` count is `0`;
- the browser file tree visibly contains `cline-watcher-refresh-20260520b.tex`.

## Follow-Up Phases

- **Project sync:** File-tree refresh for Cline-created files is working. Open-document content refresh for Cline-modified current files is now working when there are no buffered local edits. Remaining sync work is deletion/rename UX polish.
- **Storage completeness:** Uploaded binary files and non-text project assets are exported during Mongo-to-filesystem migration and covered by unit tests.
- **Review policy:** The aggressive route keeps direct Cline writes as canonical. Safety now comes from before/after git checkpoints, readable workspace diff cards, and rollback-to-before from the run summary rather than patch-gating every write.
- **SDK depth:** Project rules, selected skills, enabled plugin ids, permission profile, and tool policies now feed Cline. The remaining SDK depth is workspace index, MCP policy, shell policy, and richer model/tool capability configuration.
- **Observability:** Root-cause-safe Cline error class/code/message logging is in place with secret redaction and generic user-facing errors.
- **Legacy cleanup:** The hand-written JSON tool registry is now compatibility/settings catalog only; `AiAgentRuntime` no longer imports or calls it in the primary Cline path. Full deletion can happen after patch-review compatibility no longer needs the catalog.
- **Deployment hardening:** `@cline/sdk@0.0.41` is a web production dependency, Docker production focus installs `@superpaper/web`, and root/web workspace `zod` are pinned to `4.3.6`.
