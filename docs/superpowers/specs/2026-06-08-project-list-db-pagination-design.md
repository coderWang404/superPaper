# Project List True DB Pagination Design

## Context

`ProjectListController._getProjects` currently loads all accessible projects with `ProjectGetter.promises.findAllUsersProjects`, formats access in memory, filters in memory, sorts in memory, and returns the full filtered set. Batch F adds an API pagination compatibility layer but still keeps access semantics by slicing after full in-memory filtering. This design is the next step: move filtering, sorting, and page limits into MongoDB while preserving dashboard behavior.

Relevant files:

- Backend controller: `services/web/app/src/Features/Project/ProjectListController.mjs`
- Current project access loader: `services/web/app/src/Features/Project/ProjectGetter.mjs`
- Collaborator access queries: `services/web/app/src/Features/Collaborators/CollaboratorsGetter.mjs`
- Project schema: `services/web/app/src/models/Project.mjs`
- Tag schema and handler: `services/web/app/src/models/Tag.mjs`, `services/web/app/src/Features/Tags/TagsHandler.mjs`
- Frontend context/API: `services/web/frontend/js/features/project-list/context/project-list-context.tsx`, `services/web/frontend/js/features/project-list/util/api.ts`
- Shared API types: `services/web/types/project/dashboard/api.d.ts`

## Goals

- Return dashboard projects using MongoDB filtering, sorting, and pagination instead of full in-memory project loading.
- Preserve owner, invited collaborator, reviewer, read-only, token read/write, and token read-only access semantics.
- Preserve archived and trashed behavior exactly, including the rule that a project archived and trashed by the same user appears archived but not trashed.
- Preserve tag filters and tag counts used by the sidebar.
- Preserve owner-sort behavior with stable pagination.
- Keep Batch F API compatibility: frontend can use `page.size`, `page.offset`, `totalSize`, and load-more append behavior.

## Non-Goals

- No change to project sharing or token access rules.
- No cursor-only pagination in this phase. Offset pagination is acceptable for the dashboard because it matches Batch F and current load-more UX.
- No tag schema redesign. Tags continue to store `project_ids` as strings.
- No replacement of the dashboard table UI beyond consuming true paged results.

## API Contract

Request body:

```ts
type GetProjectsRequestBody = {
  page?: {
    size?: number
    offset?: number
  }
  sort?: {
    by?: 'lastUpdated' | 'title' | 'owner'
    order?: 'asc' | 'desc'
  }
  filters?: {
    ownedByUser?: boolean
    sharedWithUser?: boolean
    archived?: boolean
    trashed?: boolean
    tag?: string | null
    search?: string
  }
}
```

Response body:

```ts
type GetProjectsResponseBody = {
  totalSize: number
  projects: Project[]
  tagCounts?: {
    untagged: number
    byTagId: Record<string, number>
  }
  page: {
    size: number
    offset: number
    nextOffset: number | null
  }
}
```

Compatibility rules:

- Missing `page` means `{ size: 20, offset: 0 }`.
- Cap `page.size` at 100.
- Negative offsets become validation errors, not silent coercion.
- `sort.by: 'title'` maps to `name`.
- Existing clients that ignore `page` and `tagCounts` continue to work.

## Access Semantics

Current access precedence is:

1. Owner access from `owner_ref`.
2. Invite editor access from `collaberator_refs`.
3. Invite reviewer access from `reviewer_refs`.
4. Invite read-only access from `readOnly_refs`.
5. Token read/write access from `tokenAccessReadAndWrite_refs` only when `publicAccesLevel` is token based.
6. Token read-only access from `tokenAccessReadOnly_refs` only when `publicAccesLevel` is token based.

If a project appears in multiple access buckets, the highest precedence bucket wins. Token access never overrides owner or invited access. Read-only token access redacts `owner` and `lastUpdatedBy` in the formatted project response, matching current `_formatProjectInfo`.

The DB implementation should express access as an aggregation pipeline rather than five independent unpaged queries. The first stage matches any accessible project:

```js
{
  $match: {
    $or: [
      { owner_ref: userObjectId },
      { collaberator_refs: userObjectId },
      { reviewer_refs: userObjectId },
      { readOnly_refs: userObjectId },
      {
        tokenAccessReadAndWrite_refs: userObjectId,
        publicAccesLevel: 'tokenBased',
      },
      {
        tokenAccessReadOnly_refs: userObjectId,
        publicAccesLevel: 'tokenBased',
      },
    ],
  },
}
```

Then derive access fields:

```js
{
  $addFields: {
    dashboardAccessRank: {
      $switch: {
        branches: [
          { case: { $eq: ['$owner_ref', userObjectId] }, then: 0 },
          { case: { $in: [userObjectId, '$collaberator_refs'] }, then: 1 },
          { case: { $in: [userObjectId, '$reviewer_refs'] }, then: 2 },
          { case: { $in: [userObjectId, '$readOnly_refs'] }, then: 3 },
          { case: { $in: [userObjectId, '$tokenAccessReadAndWrite_refs'] }, then: 4 },
          { case: { $in: [userObjectId, '$tokenAccessReadOnly_refs'] }, then: 5 },
        ],
        default: 99,
      },
    },
    accessLevel: {
      $switch: {
        branches: [
          { case: { $eq: ['$owner_ref', userObjectId] }, then: 'owner' },
          { case: { $in: [userObjectId, '$collaberator_refs'] }, then: 'readWrite' },
          { case: { $in: [userObjectId, '$reviewer_refs'] }, then: 'review' },
          { case: { $in: [userObjectId, '$readOnly_refs'] }, then: 'readOnly' },
          { case: { $in: [userObjectId, '$tokenAccessReadAndWrite_refs'] }, then: 'readAndWrite' },
          { case: { $in: [userObjectId, '$tokenAccessReadOnly_refs'] }, then: 'readOnly' },
        ],
      },
    },
    source: {
      $cond: [{ $gte: ['$dashboardAccessRank', 4] }, 'token', 'invite']
    },
  },
}
```

Owner source must be normalized to `owner`, not `invite`, during formatting or with a more explicit `$switch`.

## Archived And Trashed Semantics

Current behavior uses `ProjectHelper.isArchived(project, userId)` and `ProjectHelper.isTrashed(project, userId) && !archived`.

DB-derived fields:

```js
{
  $addFields: {
    archivedForUser: {
      $cond: [
        { $isArray: '$archived' },
        { $in: [userObjectId, '$archived'] },
        { $eq: ['$archived', userObjectId] }
      ]
    },
    trashedRawForUser: { $in: [userObjectId, { $ifNull: ['$trashed', []] }] },
  },
},
{
  $addFields: {
    trashedForUser: {
      $and: ['$trashedRawForUser', { $not: ['$archivedForUser'] }],
    },
  },
}
```

Filters:

- Default/all filter means `archivedForUser: false` and `trashedForUser: false`.
- `ownedByUser` means owner access and not archived/trashed unless archived/trashed filter is explicitly active.
- `sharedWithUser` means access rank greater than owner and not archived/trashed unless archived/trashed filter is explicitly active.
- `archived` means `archivedForUser: true` and `trashedForUser: false`.
- `trashed` means `trashedForUser: true`.

Do not treat a globally truthy `archived` field as archived for every user unless `ProjectHelper.isArchived` already does. Tests must include array and legacy mixed values.

## Search Semantics

Current search is case-insensitive substring on `project.name`.

For the first DB pagination implementation:

```js
{ name: { $regex: escapeRegExp(filters.search.trim()), $options: 'i' } }
```

Apply a max length of 200 characters and reject invalid non-string search with `422`. This keeps behavior compatible. A later optimization can add normalized name fields or text indexes if needed.

## Tag Filters And Counts

Tags are user-owned documents with string `project_ids`. The DB project pipeline should not `$lookup` tags for every project page. Instead:

1. Load tags for the user once using `TagsHandler.promises.getAllTags(userId)`.
2. For `filters.tag`:
   - If `tag` is a string name, find the user's tag with that name and add `_id: { $in: tag.project_ids.map(ObjectId) }`.
   - If `tag === null`, filter to uncategorized active projects by excluding the union of all tag `project_ids` and requiring not archived/trashed.
3. Compute `tagCounts` from the accessible active project id set, not only the current page.

Count strategy:

- Run one aggregation facet after access/archive/search filters but before tag filter pagination:
  - `pageProjects`: applies tag filter, sort, skip, limit.
  - `total`: applies tag filter and counts.
  - `activeProjectIds`: for counts, includes accessible non-archived, non-trashed projects after search but before selected tag filter.
- In application code, intersect `activeProjectIds` with each tag's `project_ids`.
- `untagged` count is active accessible project ids minus union of all tag project ids.

This keeps tag counts exact for the current search text and access scope. If `activeProjectIds` grows too large, add a later tag-membership collection. Do not approximate counts in this phase.

## Owner Sort Behavior

Current frontend `sortProjects` sorts owner using the formatted owner user. True DB pagination cannot sort by owner display name correctly without joining users before pagination.

Owner sort pipeline:

1. Derive access and filters.
2. `$lookup` owner user by `owner_ref` with projection `{ email, first_name, last_name }`.
3. Derive `ownerSortKey`:

```js
{
  $toLower: {
    $trim: {
      input: {
        $concat: [
          { $ifNull: ['$ownerUser.first_name', ''] },
          ' ',
          { $ifNull: ['$ownerUser.last_name', ''] },
          ' ',
          { $ifNull: ['$ownerUser.email', ''] },
        ],
      },
    },
  },
}
```

4. Sort by `{ ownerSortKey: order, name: 1, _id: 1 }`.

For token read-only projects where owner is redacted, use an empty `ownerSortKey` so redacted-owner projects group consistently. Document this behavior in tests.

Other sorts:

- `lastUpdated`: `{ lastUpdated: order, _id: 1 }`
- `title`: `{ name: order, _id: 1 }`

Always include `_id` as the last sort key to keep offset pagination stable.

## Query Shape

Create a new helper in `ProjectListController.mjs` first, or split into `ProjectListQueryBuilder.mjs` if the implementation exceeds a readable size.

High-level pipeline:

```js
[
  { $match: accessibleMatch },
  { $addFields: accessFields },
  { $addFields: archiveTrashFields },
  { $match: filterMatch },
  { $match: searchMatch },
  ownerLookupStagesIfNeeded,
  { $sort: sortSpec },
  {
    $facet: {
      projects: [
        tagMatch,
        { $skip: page.offset },
        { $limit: page.size },
        { $project: projectProjection },
      ],
      total: [
        tagMatch,
        { $count: 'count' },
      ],
      activeProjectIds: [
        { $match: { archivedForUser: false, trashedForUser: false } },
        { $project: { _id: 1 } },
      ],
    },
  },
]
```

After aggregation, load `owner` and `lastUpdatedBy` users for page projects with the existing `_injectProjectUsers` logic or an equivalent user lookup. Do not populate users for every matching project.

## Indexes

Existing token indexes cover token string lookup, not dashboard membership arrays. Add non-unique indexes to `ProjectSchema`:

```js
ProjectSchema.index({ owner_ref: 1, lastUpdated: -1, _id: 1 })
ProjectSchema.index({ owner_ref: 1, name: 1, _id: 1 })
ProjectSchema.index({ collaberator_refs: 1, lastUpdated: -1, _id: 1 })
ProjectSchema.index({ reviewer_refs: 1, lastUpdated: -1, _id: 1 })
ProjectSchema.index({ readOnly_refs: 1, lastUpdated: -1, _id: 1 })
ProjectSchema.index({
  tokenAccessReadAndWrite_refs: 1,
  publicAccesLevel: 1,
  lastUpdated: -1,
  _id: 1,
})
ProjectSchema.index({
  tokenAccessReadOnly_refs: 1,
  publicAccesLevel: 1,
  lastUpdated: -1,
  _id: 1,
})
```

Tag indexes:

```js
TagSchema.index({ user_id: 1, name: 1 }, { unique: true })
TagSchema.index({ user_id: 1, project_ids: 1 })
```

Migration risk: adding indexes on large `projects` and `tags` collections can be expensive. Use background index creation where supported by the deployment's MongoDB version. Roll out indexes before enabling the DB pagination path on large instances.

## Migration And Rollout

Use a feature flag or config toggle:

```js
Settings.enableProjectListDbPagination
```

Rollout steps:

1. Add indexes and deploy with the old in-memory path still active.
2. Add DB query builder and tests.
3. Compare DB results against in-memory results in unit tests and, if practical, a temporary debug metric in non-test environments.
4. Enable DB pagination for local/test.
5. Enable for production/self-hosted default only after verification on representative data.

Fallback:

- If the DB aggregation fails, log the error and return the existing in-memory `_getProjects` result only while the flag is experimental.
- Once the flag becomes default, remove fallback to avoid hiding query bugs.

## Tests

Backend unit tests in `services/web/test/unit/src/Project/ProjectListController.test.mjs`:

- Owner, invite read/write, reviewer, invite read-only, token read/write, and token read-only projects are included with correct `accessLevel` and `source`.
- Token access is excluded when `publicAccesLevel` is not token based.
- Duplicate access uses owner/invite precedence over token access.
- Read-only token response redacts owner and lastUpdatedBy.
- Default filter excludes archived and trashed projects.
- A project both archived and trashed for the user appears archived, not trashed.
- Archived and trashed filters match current behavior.
- Search is case-insensitive substring and is applied before pagination.
- Tag name filter returns only projects in that tag.
- Uncategorized filter excludes all projects in any tag and only counts active projects.
- `tagCounts` are computed from all active accessible projects after search, not just the current page.
- Owner sort uses joined owner display data and stable `_id` tie-breakers.
- `page.size`, `page.offset`, `totalSize`, and `nextOffset` behave correctly.
- Invalid page, sort, and search inputs return validation errors.

Frontend tests after backend implementation:

- `Load More` appends DB pages without clearing existing rows.
- Changing filter, tag, search, or sort resets offset to `0`.
- Sidebar tag counts use `tagCounts` when present and fall back to loaded projects only for old responses.

## Risk

Risk is medium-high because access and dashboard filters are subtle and currently rely on in-memory precedence. The main mitigation is parity testing: for fixtures that cover every access/filter/sort combination, assert that the DB path returns the same formatted project ids, access levels, redaction, and counts as the current in-memory path.
