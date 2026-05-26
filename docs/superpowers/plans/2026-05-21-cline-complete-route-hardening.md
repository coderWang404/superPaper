# Cline Complete Route Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the clean single-agent route so Cline can directly edit real superPaper project files with rollback, project rules, readable UX, and deployable defaults.

**Architecture:** Keep Cline as the only normal agent runtime. Direct workspace writes remain canonical, but each run has before/after checkpoints and a session-level rollback endpoint. Agent settings feed Cline with project rules, selected skills, and explicit tool policy metadata instead of leaving the SDK run as a bare prompt.

**Tech Stack:** Node.js ESM, React/TypeScript, Vitest, Mocha, `@cline/sdk`, git-backed project checkpoints, existing AI provider and agent settings models.

---

## File Structure

- Modify `services/web/app/src/Features/Project/ProjectCheckpointService.mjs`: return changed paths after restoring a commit.
- Modify `services/web/app/src/Features/AiAgent/AiAgentRuntime.mjs`: add session rollback and pass selected rules/skills/tool policy into Cline.
- Modify `services/web/app/src/Features/AiAgent/AiAgentController.mjs`: expose session rollback.
- Modify `services/web/app/src/router.mjs`: mount rollback route behind login, rate limit, and write access.
- Modify `services/web/app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs`: compose Cline system prompt from superPaper rules/skills and keep Cline tools single-agent.
- Modify `services/web/frontend/js/features/ai-assistant/api.ts`: add checkpoint rollback client.
- Modify `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`: add rollback action to run summary.
- Modify corresponding unit/frontend tests.
- Modify `docs/superpowers/plans/2026-05-20-cline-primary-agent-runtime.md`: update remaining gap status after implementation.

## Current Status

Completed on 2026-05-21. The clean route now treats Cline as the primary single-agent runtime, runs it against the real project workspace, injects project rules/skills/tool policy context, records before/after checkpoints and workspace diffs, and exposes rollback to the before checkpoint from the AI Assistant run summary.

## Task 1: Session Checkpoint Rollback

- [x] **Step 1: Write failing checkpoint service test**

Add a test in `services/web/test/unit/src/Project/ProjectCheckpointService.test.mjs` that creates a checkpoint, edits `main.tex`, calls `restoreCommit`, and expects `main.tex` to return to the checkpoint content plus `changedPaths: ['/main.tex']`.

- [x] **Step 2: Run red test**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs -t "restores a checkpoint and reports changed paths"
```

Expected: fail because `restoreCommit` currently only returns `{ commitHash }`.

- [x] **Step 3: Implement changed path reporting**

In `ProjectCheckpointService.restoreCommit`, gather `git diff --name-only -- .` before checkout, restore the commit, and return normalized leading-slash paths.

- [x] **Step 4: Add runtime/controller/routes rollback**

Add `rollbackSessionToCheckpoint({ projectId, userId, sessionId, commitHash })` in `AiAgentRuntime.mjs`. It must verify the session belongs to the project/user, call `ProjectCheckpointService.restoreCommit`, record a `checkpoint_restored` event, and return `{ session, restoredCommitHash, changedPaths }`.

- [x] **Step 5: Add frontend rollback action**

Add `rollbackProjectAiAgentSessionCheckpoint(projectId, sessionId, commitHash)` to `api.ts`. Render a rollback button in the run summary when a before checkpoint exists. On success, append or surface a restored event and refresh session status.

## Task 2: Cline Rules, Skills, And Tool Policy Context

- [x] **Step 1: Write failing runtime test**

In `AiAgentRuntime.test.mjs`, assert that a Cline run passes selected skill content, enabled instruction profile content, enabled plugin ids, and permission/tool policy into the adapter.

- [x] **Step 2: Implement runtime context collection**

Use `getAgentConfig({ projectId, includeContent: true })` and `getSelectedSkillsForTask(prompt, { projectId })` before invoking Cline. Store the selected ids on the session and pass a compact `agentContext` object to the adapter.

- [x] **Step 3: Write failing adapter test**

In `ClineAgentRuntimeAdapter.test.mjs`, assert that Cline `config.systemPrompt` contains the selected rules and skills, and that `enableSpawnAgent` and `enableAgentTeams` stay `false`.

- [x] **Step 4: Implement prompt composition**

In `ClineAgentRuntimeAdapter.mjs`, compose the base system prompt with `agentContext.instructionProfiles` and `agentContext.skills`. Do not include provider secrets.

## Task 3: Legacy JSON Tool Loop Quarantine

- [x] **Step 1: Verify default runtime has no legacy stream path**

Use `rg` to prove `AiAgentRuntime` no longer imports or calls custom JSON streaming/tool-loop code.

- [x] **Step 2: Rename settings-facing tool wording**

Keep `AiAgentToolRegistry` available only for settings/catalog and patch review compatibility. Add comments/tests clarifying it is not the primary Cline runtime.

## Task 4: Delete/Rename Open Document UX

- [x] **Step 1: Add frontend tests**

Extend `filesystem-change-listener.test.tsx` for current document deletion/rename payloads. If the current doc disappears from refreshed rootFolder, do not force reopen it; leave file tree refreshed and let existing editor error handling own the state.

- [x] **Step 2: Implement no-stale reopen guard**

Ensure the socket listener only calls `openDocWithId(currentDocumentId, { forceReopen: true })` when the refreshed rootFolder still contains the current doc id and the changed path matches.

## Task 5: Deployment Hardening

- [x] **Step 1: Verify Docker dependency state**

Inspect `services/web/Dockerfile`, `package.json`, and `yarn.lock` for `@cline/sdk` and `zod@4.3.6` installation in the server image.

- [x] **Step 2: Update docs/plan status**

Record exact verification commands and remaining gaps.

## Verification

Fresh verification:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx
node ../../node_modules/eslint/bin/eslint.js app/src/Features/AiAgent/AiAgentRuntime.mjs app/src/Features/AiAgent/AiAgentController.mjs app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs app/src/Features/Project/ProjectCheckpointService.mjs test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs frontend/js/features/ai-assistant/api.ts frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx frontend/js/features/ide-react/hooks/use-socket-listeners.ts test/frontend/features/file-tree/filesystem-change-listener.test.tsx
git diff --check
```

Results from 2026-05-21:

- `corepack yarn --cwd services/web vitest run test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/AiAgent/AiAgentRuntime.test.mjs test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs test/unit/src/AiAgent/AiAgentController.test.mjs test/unit/src/AiAgent/AiAgentRoutes.test.mjs` -> 5 files, 43 tests passed.
- `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/file-tree/filesystem-change-listener.test.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx` -> 28 tests passed.
- `node ../../node_modules/eslint/bin/eslint.js ...` over the touched backend/frontend files -> passed after simplifying the Cline event queue loop.
- `corepack yarn install` -> exit 0; existing peer warnings remain, and `@superpaper/web` now pins `zod` to `4.3.6`.
- Real browser smoke with `Root Channel Provider` / `gpt-5.2` on project `6a0da04be1d53948727c0876`:
  - Plan mode returned a plan and rendered the run summary with before/after commit hashes.
  - Act mode used Cline `apply_patch` to create `browser-rollback-smoke-20260521.tex`; the file appeared in the browser file tree and the run summary showed `Before c1e07a6b` / `After 7c535811`.
  - Rollback to `c1e07a6b8edba094e70bf9ca72f8ad6b07998eb6` returned HTTP 200 with `changedPaths: ["/browser-rollback-smoke-20260521.tex"]`, wrote a `checkpoint_restored` event, reset the workspace HEAD to `c1e07a6`, and removed the file from the file-tree endpoint.
- Real rollback smoke found and fixed two issues that unit stubs had missed:
  - `AgentEvent` schema now includes `checkpoint_restored`.
  - `ProjectCheckpointService.restoreCommit` now resets the workspace repo to the target checkpoint and cleans removed files, instead of only checking out paths that still exist in the target commit.

Deployment notes:

- `services/web/package.json` includes `@cline/sdk@0.0.41` as a production dependency.
- `services/web/Dockerfile` runs `NODE_ENV=production yarn workspaces focus --production @superpaper/web`, so the Cline SDK is included in the server image dependency layer.
- Root and web workspace `zod` declarations now resolve to `4.3.6`, matching Cline 0.0.41's runtime expectations.
