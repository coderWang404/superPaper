# Product Audit Remaining Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining verified product-audit upgrade work without redoing fixes that are already present.

**Architecture:** Split the work into narrow, independently testable slices. Ship low-risk correctness and UX fixes first, then handle contract-changing product work with dedicated specs and implementation plans.

**Tech Stack:** Node.js/Express, Mongo/Mongoose, React/TypeScript frontend, vanilla admin scripts, i18next JSON locales, Mocha/Vitest/Cypress component tests.

---

## Verified Current State

- Existing commits through `9341a7c` are pushed to `origin/main`.
- AI Provider Admin exists and redacts secrets, but still needs safer error contracts, null guards, edit UI, and later React migration.
- AI Agent patch-wide apply/rollback exists. Per-hunk approval is still open and changes patch semantics, so it needs a short design first.
- AI Agent stop/cancel plumbing exists, but the Cline SDK abort call should pass the active Cline session id.
- Project List still loads and filters the full project set in memory. API shape exists, but server-side pagination/search is not implemented.
- zh-CN is missing 594 keys compared with `en.json`; current locale lint does not prevent new missing zh-CN keys.
- Session regeneration, password policy, and login throttling exist. Remaining short-term security work is validation evidence and malformed password-update input handling.
- Editor/file tree/PDF/history accessibility is partially done. Remaining short-term work is tree hierarchy semantics, PDF accessible names, and targeted restore/share error tests.

## Execution Order

### Batch A: Low-Risk Agent Runtime And UI Hardening

**Files:**
- Modify: `services/web/app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs`
- Modify: `services/web/test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs`
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`

- [ ] Add a failing unit test that expects `cline.abort(clineSessionId, AbortError)` and `cline.stop(clineSessionId)` on abort.
- [ ] Pass `clineSessionId` into `createClineAbortHandler` and call SDK cancellation methods with the session id.
- [ ] Add a failing frontend test proving persisted agent events are capped while keeping summary-critical events.
- [ ] Implement a bounded append helper for `agentEvents`.
- [ ] Add a failing frontend test proving a floating run summary cannot be dragged past viewport bounds.
- [ ] Clamp floating summary position during drag and on resize.
- [ ] Verify with the Agent backend/frontend target suites and commit.

### Batch B: Admin Provider Error Contract And Edit Foundation

**Files:**
- Modify: `services/web/app/src/Features/AiAssistant/AiProviderAdminController.mjs`
- Modify: `services/web/app/src/Features/AiAssistant/AiProviderManager.mjs`
- Modify: `services/web/app/src/Features/AiAssistant/AiProviderValidation.mjs`
- Modify: `services/web/test/unit/src/AiAssistant/AiProviderAdminController.test.mjs`
- Modify: `services/web/test/unit/src/AiAssistant/AiProviderManager.test.mjs`
- Modify: `services/web/test/unit/src/AiAssistant/AiProviderValidation.test.mjs`
- Modify: `services/web/frontend/js/features/ai-provider-admin/ai-provider-admin.ts`
- Modify: `services/web/test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts`

- [ ] Add failing backend tests for field-safe validation errors, `AiProviderValidationError` 422 mapping, missing-provider `testProvider` 404 behavior, and responses that never include `apiKey` or `encryptedApiKey`.
- [ ] Add failing frontend tests for displaying field-safe errors and ignoring null provider payloads.
- [ ] Implement safe error payloads with code/message/field summaries and no raw submitted secret values.
- [ ] Make `testProvider` return `null` or throw a not-found path that the controller maps to 404, not `{ provider: null }`.
- [ ] Preserve secret redaction on create/update/list/test/sync.
- [ ] Verify with AiProvider backend and frontend admin suites and commit.

### Batch C: Locale Coverage Guardrail And High-Value zh-CN Fill

**Files:**
- Modify: `services/web/scripts/translations/checkCoverage.js`
- Modify: `services/web/bin/lint_locales`
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/test/unit/src/infrastructure/Translations.test.mjs` or add a focused translation script test if local pattern exists.

- [ ] Add `--check` mode using set-based diffs for `en - zh-CN`, `zh-CN - en`, `frontend/extracted - en`, and `frontend/extracted - zh-CN`.
- [ ] Use current debt as explicit baseline: zh-CN missing must not exceed 594; frontend-extracted zh-CN missing must not exceed 459 until later fill batches reduce it.
- [ ] Wire the guardrail into `bin/lint_locales`.
- [ ] Add high-value zh-CN keys for editor sidebar/history/share/PDF labels called out by the audit.
- [ ] Verify `bin/lint_locales`, `bin/check_extracted_translations`, and targeted i18n tests, then commit.

### Batch D: Security Edge Validation

**Files:**
- Modify: `services/web/app/src/Features/User/UserController.mjs`
- Modify: `services/web/test/unit/src/User/UserController.test.mjs`
- Modify: `services/web/test/acceptance/src/PasswordUpdateTests.mjs`
- Optionally modify: `services/web/test/acceptance/src/AuthenticationTests.mjs`

- [ ] Add failing tests showing missing/empty `currentPassword`, `newPassword1`, or `newPassword2` return 400 instead of 500.
- [ ] Implement password update request validation before authentication-manager calls.
- [ ] Add direct session-fixation regression coverage if acceptance helpers expose pre/post cookies reliably.
- [ ] Verify targeted User/Auth tests and commit.

### Batch E: Accessibility And Collaboration UX Tests

**Files:**
- Modify: `services/web/frontend/js/features/file-tree/components/file-tree-folder-list.tsx`
- Modify: `services/web/frontend/js/features/history/components/file-tree/history-file-tree-folder-list.tsx`
- Modify: `services/web/frontend/js/features/pdf-preview/components/pdf-js-viewer.tsx`
- Modify: `services/web/frontend/js/features/pdf-preview/components/pdf-viewer.tsx`
- Modify: relevant tests under `services/web/test/frontend/features/file-tree`, `history`, `share-project-modal`, and `components/pdf-preview`.

- [ ] Add failing tests for one root `tree` plus nested `group` roles in file tree and history file tree.
- [ ] Implement root-vs-nested tree role props.
- [ ] Add failing tests for localized PDF viewer accessible names and iframe title.
- [ ] Implement localized labels.
- [ ] Add targeted tests proving restore confirmation cancel does not call the API and confirm does.
- [ ] Add sharing-updates backend error alert tests for invite resend/revoke/update failures.
- [ ] Verify targeted frontend/Cypress component suites and commit.

### Batch F: Project List Pagination Contract

**Files:**
- Modify: `services/web/app/src/Features/Project/ProjectListController.mjs`
- Modify: `services/web/types/project/dashboard/api.d.ts`
- Modify: `services/web/test/unit/src/Project/ProjectListController.test.mjs`
- Modify: `services/web/frontend/js/features/project-list/context/project-list-context.tsx`
- Modify: `services/web/frontend/js/features/project-list/util/api.ts`
- Modify: `services/web/frontend/js/features/project-list/components/search-form.tsx`
- Modify: project-list tests.

- [ ] Add backend tests for `page.size`, `page.offset`, `totalSize`, search filtering, default backward compatibility, and safe page-size caps.
- [ ] Implement in-memory slicing and metadata first to preserve current access semantics while enabling frontend paging.
- [ ] Add frontend tests that `Load More` requests the next page and appends projects.
- [ ] Add search debounce tests with fake timers and query reset behavior.
- [ ] Implement loading skeleton rows for page fetches without clearing existing rows.
- [ ] Commit this compatibility layer before attempting DB-level pagination.

### Batch G: Dedicated Designs Before Large Refactors

**Per-hunk Agent Approval:**
- Create: `docs/superpowers/specs/2026-06-08-agent-per-hunk-approval-design.md`
- Create: `docs/superpowers/plans/2026-06-08-agent-per-hunk-approval.md`
- Define stable hunk ids, selected-hunk apply request shape, partial rollback semantics, and conflict handling.

**Admin React Migration:**
- Create: `docs/superpowers/specs/2026-06-08-admin-ai-react-migration-design.md`
- Create: `docs/superpowers/plans/2026-06-08-admin-ai-react-migration.md`
- Sequence after Batch B so validation contract is stable before migrating UI.

**Project List True DB Pagination:**
- Create: `docs/superpowers/specs/2026-06-08-project-list-db-pagination-design.md`
- Account for owner/collab/token access, archived/trashed semantics, tag counts, and owner-sort behavior.

**MFA / Account Lockout:**
- Keep as strategic backlog unless a compliance requirement explicitly demands it. Start with admin-only TOTP if approved later.

## Verification Matrix

Run these after the relevant batches:

```bash
cd services/web

yarn test:unit \
  test/unit/src/AiAgent/ClineAgentRuntimeAdapter.test.mjs \
  test/unit/src/AiAgent/AiAgentRuntime.test.mjs \
  test/unit/src/AiAgent/AiAgentController.test.mjs \
  test/unit/src/AiAssistant/AiProviderAdminController.test.mjs \
  test/unit/src/AiAssistant/AiProviderManager.test.mjs \
  test/unit/src/AiAssistant/AiProviderValidation.test.mjs \
  test/unit/src/User/UserController.test.mjs \
  test/unit/src/Project/ProjectListController.test.mjs

NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 5000 --exit \
  --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js \
  test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx \
  test/frontend/features/ai-provider-admin/ai-provider-admin.test.ts \
  test/frontend/features/project-list/components/project-list-root.test.tsx \
  test/frontend/features/project-list/components/load-more.test.tsx \
  test/frontend/features/project-list/components/project-search.test.tsx \
  test/frontend/features/share-project-modal/components/share-project-modal.test.tsx \
  test/frontend/components/pdf-preview/pdf-js-viewer.spec.tsx

bin/lint_locales
bin/check_extracted_translations
git diff --check
```

Use narrower commands during TDD red/green loops, then broaden before each commit.
