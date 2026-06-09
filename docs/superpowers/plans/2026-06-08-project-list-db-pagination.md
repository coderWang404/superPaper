# Project List DB Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move dashboard project listing to a MongoDB-backed pagination contract while preserving the current access, filter, sort, tag, and redaction behavior.

**Architecture:** Keep request normalization and HTTP orchestration in `ProjectListController.mjs`. Add the DB read/pipeline implementation to `ProjectGetter.mjs`, with controller tests preserving the existing in-memory contract and a new sequential DB test file covering real Mongo ObjectId, string tag ids, Mixed archived fields, `$facet`, and token access gates. Frontend consumes the new `page` and `tagCounts` fields but keeps fallback behavior for old responses.

**Tech Stack:** Node ESM, Mongoose/Mongo aggregation, Vitest backend tests, React/TypeScript project-list context tests, existing Overleaf/superPaper project dashboard types.

**Compatibility Decisions:**
- Preserve the current legacy API behavior where callers that omit `page` receive the full filtered result. Dashboard and DB-pagination callers should send `page`; the controller only returns `page` metadata when a page was requested.
- Preserve current search semantics for compatibility: case-insensitive literal substring, no controller-side trim, reject non-strings and strings longer than 200.
- Lock access precedence in tests before implementation. The intended DB precedence is owner, invite read/write, reviewer, invite read-only, token read/write, token read-only; token access never overrides owner or invite access.
- Convert dashboard `userId` strings to ObjectId inside the DB helper and guard every `$in` array operand with `$isArray`/`$ifNull`, especially `archived` because the schema is `Mixed`.
- Preserve title sort parity with current JS `name.toLowerCase()` by sorting on a derived lower-case field, not raw Mongo `{ name: 1 }`.

---

### Task 1: Response Contract On Existing Path

**Files:**
- Modify: `services/web/types/project/dashboard/api.d.ts`
- Modify: `services/web/app/src/Features/Project/ProjectListController.mjs`
- Test: `services/web/test/unit/src/Project/ProjectListController.test.mjs`

- [ ] **Step 1: Write failing tests for `page` metadata**

Add assertions to existing pagination tests:

```js
expect(response.page).to.deep.equal({
  size: 2,
  offset: 1,
  nextOffset: 3,
})
```

Add one test for the final page:

```js
it('reports null nextOffset on the final page', async function (ctx) {
  setOwnedProjects(ctx, [1, 2, 3].map(id => buildProject(id)))
  ctx.req.body = {
    page: { size: 2, offset: 2 },
    sort: { by: 'lastUpdated', order: 'desc' },
  }

  await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

  const response = ctx.res.json.firstCall.args[0]
  expect(response.page).to.deep.equal({
    size: 2,
    offset: 2,
    nextOffset: null,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectListController.test.mjs
```

Expected: FAIL because `response.page` is undefined.

- [ ] **Step 3: Implement `page` metadata for the in-memory path**

Add a helper in `ProjectListController.mjs`:

```js
function _buildPageResponse(page, totalSize) {
  if (page == null) {
    return undefined
  }
  const normalizedPage = _normalizePage(page)
  const nextOffset = normalizedPage.offset + normalizedPage.size
  return {
    size: normalizedPage.size,
    offset: normalizedPage.offset,
    nextOffset: nextOffset < totalSize ? nextOffset : null,
  }
}
```

Include `page: _buildPageResponse(page, filteredProjects.length)` in `_getProjects` responses when callers provide `page`.

- [ ] **Step 4: Write failing tests for `tagCounts`**

Add tests that assert counts are computed from all active filtered accessible projects, not just the page:

```js
expect(response.tagCounts).to.deep.equal({
  untagged: 1,
  byTagId: {
    'tag-a': 2,
  },
})
```

- [ ] **Step 5: Run test to verify it fails**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectListController.test.mjs
```

Expected: FAIL because `tagCounts` is undefined.

- [ ] **Step 6: Implement `tagCounts` for the in-memory path**

Add:

```js
function _buildTagCounts(projects, tags) {
  const activeProjectIds = new Set(
    projects
      .filter(project => !project.archived && !project.trashed)
      .map(project => project.id)
  )
  const taggedProjectIds = new Set()
  const byTagId = {}
  for (const tag of tags) {
    const tagId = tag._id?.toString()
    if (!tagId) continue
    const count = (tag.project_ids || []).filter(projectId =>
      activeProjectIds.has(projectId)
    ).length
    byTagId[tagId] = count
    for (const projectId of tag.project_ids || []) {
      if (activeProjectIds.has(projectId)) {
        taggedProjectIds.add(projectId)
      }
    }
  }
  return {
    untagged: activeProjectIds.size - taggedProjectIds.size,
    byTagId,
  }
}
```

Call it with projects filtered by access/search/status before tag pagination.

- [ ] **Step 7: Update types**

Extend `GetProjectsResponseBody`:

```ts
export type ProjectListPage = {
  size: number
  offset: number
  nextOffset: number | null
}

export type ProjectTagCounts = {
  untagged: number
  byTagId: Record<string, number>
}

export type GetProjectsResponseBody = {
  totalSize: number
  projects: Project[]
  page?: ProjectListPage
  tagCounts?: ProjectTagCounts
}
```

- [ ] **Step 8: Run tests and commit**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectListController.test.mjs
cd ../..
git diff --check
git add services/web/types/project/dashboard/api.d.ts services/web/app/src/Features/Project/ProjectListController.mjs services/web/test/unit/src/Project/ProjectListController.test.mjs
git diff --cached
rg -n "apiKey|encryptedApiKey|password|secret|token" --glob '!node_modules' --glob '!services/web/locales/*.json' --glob '!services/web/frontend/extracted-translations.json' --glob '!*.md' --glob '!*.test.*' .
git commit -m "feat(project-list): expose page metadata and tag counts"
git push
```

### Task 2: Mongo Fixture Tests For DB Helper

**Files:**
- Test: `services/web/test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs`
- Modify later: `services/web/app/src/Features/Project/ProjectGetter.mjs`

- [ ] **Step 1: Write failing real-Mongo test for access buckets and token gates**

Create a sequential test using `waitForDb()` and `cleanupTestDatabase`. Insert one project for each bucket: owner, invite read/write, reviewer, invite read-only, token read/write, token read-only, and a token project with `publicAccesLevel: 'private'`. Assert the private token project is absent and access/source values match the current dashboard contract.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs
```

Expected: FAIL because `ProjectGetter.promises.findUsersProjectListPage` is not defined.

- [ ] **Step 3: Add DB helper skeleton**

Add `findUsersProjectListPage(userId, { filters, sort, page, tags })` to `ProjectGetter.mjs`. Initially implement access `$match`, access/source derivation, archived/trashed fields, lastUpdated sorting, `$facet`, and page metadata.

- [ ] **Step 4: Expand tests before broadening implementation**

Add tests for:
- Duplicate precedence: owner beats every other path; invite read/write beats reviewer, invite read-only, and token; reviewer beats invite read-only and token; invite read-only beats token; token read/write beats token read-only.
- Token read-only privacy: `owner_ref` is `null`, `lastUpdatedBy` is `null`.
- Archived beats trashed with array and Mixed legacy shapes.
- `ownedByUser` and `sharedWithUser`, including both true returns empty.

- [ ] **Step 5: Run focused DB tests and commit**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs
cd ../..
git diff --check
git add services/web/app/src/Features/Project/ProjectGetter.mjs services/web/test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs
git diff --cached
rg -n "apiKey|encryptedApiKey|password|secret|token" --glob '!node_modules' --glob '!services/web/locales/*.json' --glob '!services/web/frontend/extracted-translations.json' --glob '!*.md' --glob '!*.test.*' .
git commit -m "feat(project-list): add Mongo-backed project page query"
git push
```

### Task 3: DB Filters, Sorting, Totals, And Tag Counts

**Files:**
- Modify: `services/web/app/src/Features/Project/ProjectGetter.mjs`
- Test: `services/web/test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs`

- [ ] **Step 1: Write failing tests for search, tag, and totals**

Add real-Mongo tests for:
- Case-insensitive substring search before pagination.
- Search input does not trim whitespace and does not treat regex metacharacters as regex.
- Title sorting is case-insensitive and stable, matching the current `name.toLowerCase()` behavior.
- Tag filter by `_id` and by `name`.
- `tag: null` untagged filter using `Tag.project_ids` strings against ObjectId project ids.
- `tagCounts` computed from active accessible projects after search but before selected tag filter.
- `totalSize` after filters before `$skip/$limit`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs
```

Expected: FAIL on unimplemented tag/search/count behavior.

- [ ] **Step 3: Implement search/tag/count pipeline support**

Use escaped regex for search and enforce search max length at the controller boundary. Use application-loaded tags to build tag id sets, converting only valid ObjectId strings for project `_id` filters and ignoring invalid/stale tag project ids. Sort titles by a derived lower-case field. Return:

```js
{
  totalSize,
  projects,
  page: { size, offset, nextOffset },
  tagCounts,
}
```

- [ ] **Step 4: Write failing tests for owner sort**

Add fixtures with users that cover:
- Owned project sort key fixed to `You`.
- Non-owned owner first+last.
- Non-owned fallback to email.
- Missing owner user -> empty string.
- Stable `_id` tie-break.

- [ ] **Step 5: Implement owner sort**

Use `$lookup` on `users`, derive owner sort key before pagination, and preserve token read-only owner redaction.

- [ ] **Step 6: Run focused DB tests and commit**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs
cd ../..
git diff --check
git add services/web/app/src/Features/Project/ProjectGetter.mjs services/web/test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs
git diff --cached
rg -n "apiKey|encryptedApiKey|password|secret|token" --glob '!node_modules' --glob '!services/web/locales/*.json' --glob '!services/web/frontend/extracted-translations.json' --glob '!*.md' --glob '!*.test.*' .
git commit -m "feat(project-list): filter and sort project pages in Mongo"
git push
```

### Task 4: Controller Wiring And Validation

**Files:**
- Modify: `services/web/app/src/Features/Project/ProjectListController.mjs`
- Modify: `services/web/config/settings.defaults.js`
- Test: `services/web/test/unit/src/Project/ProjectListController.test.mjs`

- [ ] **Step 1: Write failing controller tests for DB path wiring**

Add tests with `Settings.enableProjectListDbPagination = true` that assert:
- `_getProjects` calls `ProjectGetter.promises.findUsersProjectListPage`.
- It passes normalized `filters`, `sort`, capped `page`, and user tags.
- It still returns 400 for invalid page/sort/filter.
- `filters.search` rejects non-string and strings longer than 200.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectListController.test.mjs
```

Expected: FAIL because controller still only calls in-memory path.

- [ ] **Step 3: Wire feature flag**

Add `enableProjectListDbPagination: false` to defaults. In `_getProjects`, load tags once, and when the flag is true and callers provide `page`, call:

```js
ProjectGetter.promises.findUsersProjectListPage(userId, {
  filters,
  sort,
  page,
  tags,
})
```

Keep the old path as fallback while the flag is off or when callers omit `page`, preserving the legacy full-list API response.

- [ ] **Step 4: Run controller and DB tests and commit**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectListController.test.mjs test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs
cd ../..
git diff --check
git add services/web/app/src/Features/Project/ProjectListController.mjs services/web/config/settings.defaults.js services/web/test/unit/src/Project/ProjectListController.test.mjs
git diff --cached
rg -n "apiKey|encryptedApiKey|password|secret|token" --glob '!node_modules' --glob '!services/web/locales/*.json' --glob '!services/web/frontend/extracted-translations.json' --glob '!*.md' --glob '!*.test.*' .
git commit -m "feat(project-list): gate dashboard on DB pagination query"
git push
```

### Task 5: Index Review

**Files:**
- Review: `services/web/app/src/models/Project.mjs`
- Review: `services/web/app/src/models/Tag.mjs`
- Review: `tools/migrations/20190912145024_create_projects_indexes.mjs`
- Review: `tools/migrations/20190912145029_create_tags_indexes.mjs`
- Review: `tools/migrations/20241204103349_create_reviewer_refs_index.mjs`

- [ ] **Step 1: Review existing indexes before adding new ones**

Do not add schema indexes until the existing migration history has been checked.
The project list DB helper begins with an `$or` membership `$match` over
`owner_ref`, `collaberator_refs`, `reviewer_refs`, `readOnly_refs`,
`tokenAccessReadAndWrite_refs`, and `tokenAccessReadOnly_refs`.

Existing migrations already provide the minimal membership indexes used by that
front-loaded access match:

```js
{ owner_ref: 1 }
{ collaberator_refs: 1 }
{ readOnly_refs: 1 }
{ tokenAccessReadAndWrite_refs: 1 }
{ tokenAccessReadOnly_refs: 1 }
{ reviewer_refs: 1 }
```

- [ ] **Step 2: Record the index decision**

Decision after review: do not add the originally proposed compound schema
indexes for this rollout.

Reasons:
- The proposed `{ <membership_ref>: 1, lastUpdated: -1, _id: 1 }` indexes are
  prefix-duplicates of existing membership indexes and are unlikely to serve the
  `$sort`, because sorting happens inside a `$facet` after `$addFields` derived
  access/status fields.
- Title sort uses a derived lower-case field and search uses a case-insensitive
  literal substring regex, so a plain `{ name: 1 }` compound index would not
  provide the intended sort/search benefit.
- `TagSchema.index({ user_id: 1, project_ids: 1 })` is not used by the project
  list pagination query, which loads all tags for the user and builds project id
  sets in application code. The existing unique `{ user_id: 1, name: 1 }` tag
  index already covers the `user_id` prefix for `getAllTags(userId)`.
- `autoIndex` is disabled in this app, so production index additions should be
  shipped as deliberate migrations after explain-plan evidence, not as schema
  declarations.

Optional future work: if production explain plans show token-shared projects are
hot enough to need more selectivity, evaluate migration-backed indexes on
`{ tokenAccessReadAndWrite_refs: 1, publicAccesLevel: 1 }` and
`{ tokenAccessReadOnly_refs: 1, publicAccesLevel: 1 }`.

- [ ] **Step 3: Verify the reviewed query path still passes**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs test/unit/src/Tags/TagsHandler.test.mjs
cd ../..
git diff --check
git add docs/superpowers/plans/2026-06-08-project-list-db-pagination.md
git diff --cached
rg -n "apiKey|encryptedApiKey|password|secret|token" --glob '!node_modules' --glob '!services/web/locales/*.json' --glob '!services/web/frontend/extracted-translations.json' --glob '!*.md' --glob '!*.test.*' .
git commit -m "docs(project-list): record DB pagination index review"
git push
```

### Task 6: Frontend `page` And `tagCounts` Consumption

**Files:**
- Modify: `services/web/frontend/js/features/project-list/context/project-list-context.tsx`
- Test: `services/web/test/frontend/features/project-list/components/load-more.test.tsx`
- Test: `services/web/test/frontend/features/project-list/components/project-list-root.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add tests that assert:
- Load More uses `response.page.nextOffset` for the next request when present.
- Filter, tag, search, and sort refreshes request offset `0`.
- Sidebar tag counts use `response.tagCounts` when present.
- Old responses without `tagCounts` still fall back to loaded projects.
- Responses with `page` metadata are treated as server-filtered and server-sorted; the client must not apply a second local search/filter/tag/sort pass that can shrink a valid server page.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 10000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/project-list/components/load-more.test.tsx test/frontend/features/project-list/components/project-list-root.test.tsx
```

- [ ] **Step 3: Implement frontend response consumption**

Track server page state:

```ts
const [nextPageOffset, setNextPageOffset] = useState<number | null>(
  prefetchedProjectsBlob?.page?.nextOffset ?? null
)
const [serverTagCounts, setServerTagCounts] =
  useState<GetProjectsResponseBody['tagCounts']>(prefetchedProjectsBlob?.tagCounts)
```

Use `data.page?.nextOffset ?? loadedProjects.length + data.projects.length` after successful page requests. Use `serverTagCounts` for `untaggedProjectsCount` and `projectsPerTag`, falling back to loaded-project calculations.

When `prefetchedProjectsBlob?.page` or the latest response includes `page`, set `visibleProjects` from the loaded server page/window directly and use `totalSize - loadedProjects.length` for hidden counts. Keep the existing local filtering path only for legacy responses without `page`, because old responses represented a full filtered project set.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 10000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/project-list/components/load-more.test.tsx test/frontend/features/project-list/components/project-list-root.test.tsx
cd ../..
git diff --check
git add services/web/frontend/js/features/project-list/context/project-list-context.tsx services/web/test/frontend/features/project-list/components/load-more.test.tsx services/web/test/frontend/features/project-list/components/project-list-root.test.tsx
git diff --cached
rg -n "apiKey|encryptedApiKey|password|secret|token" --glob '!node_modules' --glob '!services/web/locales/*.json' --glob '!services/web/frontend/extracted-translations.json' --glob '!*.md' --glob '!*.test.*' .
git commit -m "feat(project-list): consume DB page cursors and tag counts"
git push
```

### Task 7: Final Parity And Browser Smoke

**Files:**
- Modify only files needed for defects found during verification.

- [ ] **Step 1: Run backend test group**

Run:

```bash
cd services/web
yarn test:unit test/unit/src/Project/ProjectListController.test.mjs test/unit/src/Project/ProjectGetter.test.mjs test/unit/src/Project/ProjectGetterProjectListPage.sequential.test.mjs test/unit/src/Tags/TagsHandler.test.mjs
```

- [ ] **Step 2: Run frontend project-list tests**

Run:

```bash
cd services/web
NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 10000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/project-list/components/load-more.test.tsx test/frontend/features/project-list/components/project-search.test.tsx test/frontend/features/project-list/components/project-list-root.test.tsx
```

- [ ] **Step 3: Browser smoke**

If the local Docker dev stack mounts this worktree, open `http://127.0.0.1:23000/project` and smoke:
- Initial dashboard renders first page.
- Load More appends without replacing.
- Search resets to the first server page.
- Tag sidebar counts remain stable when only one page is loaded.

If Docker still mounts another worktree, record that exact blocker.

- [ ] **Step 4: Final review and push**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
git push
```

Document any remaining rollout risk in the final update.
