# Cline Filesystem Project Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move superPaper toward filesystem/git-backed project workspaces so a single Cline agent can directly edit real LaTeX project files.

**Architecture:** This plan implements the route in phases. Phase 1 builds a tested backend foundation without changing the browser editor yet: workspace path containment, file store, git checkpoints, and Mongo-to-workspace migration export. Later phases switch project read/write, compile, watcher sync, and the Cline runtime adapter onto this foundation.

**Tech Stack:** Node.js ESM, Vitest, Mongoose models, existing superPaper service modules, native filesystem APIs, `git` CLI via `child_process`.

---

## Scope And Phasing

The approved spec spans storage, editor persistence, collaboration, compile, agent runtime, UI, and migration. Implementing it as one giant change would be too risky. This plan is intentionally staged:

- Phase 1: backend workspace foundation. This is the plan section with exact steps below.
- Phase 2: filesystem-backed project entity reads and file tree support.
- Phase 3: editor write path and document persistence for filesystem projects.
- Phase 4: compile from workspace.
- Phase 5: watcher-driven browser sync and conflict state.
- Phase 6: Cline SDK/Core adapter for single-agent runs against workspace cwd.
- Phase 7: agent workbench UI replacement.
- Phase 8: admin migration controls and cleanup of Mongo-doc-first assumptions.

Phase 1 must land before later phases. Later phases should each get their own follow-up plan after Phase 1 is verified, because each crosses different existing Overleaf subsystems.

## Phase 1 File Structure

- Create: `services/web/app/src/Features/Project/ProjectWorkspaceManager.mjs`
  - Resolves project workspace paths from settings.
  - Normalizes project-relative paths.
  - Enforces containment, symlink escape prevention, and sensitive path blocks.
- Create: `services/web/app/src/Features/Project/ProjectFileStore.mjs`
  - Reads, writes, lists, creates, deletes, renames, and moves workspace files.
  - Returns folder/doc/file entries suitable for later file-tree adapters.
- Create: `services/web/app/src/Features/Project/ProjectCheckpointService.mjs`
  - Initializes git repositories.
  - Creates commits/checkpoints.
  - Produces diffs and restores files/commits.
- Create: `services/web/app/src/Features/Project/ProjectStorageMigrationService.mjs`
  - Exports current Mongo/docstore docs and filestore file refs into workspace.
  - Writes `.superpaper/project.json`.
  - Initializes a migration checkpoint.
- Create: `services/web/app/src/models/ProjectCheckpoint.mjs`
  - Stores checkpoint metadata in Mongo.
- Modify: `services/web/app/src/models/Project.mjs`
  - Adds `storageBackend` and `workspace` metadata.
- Test: `services/web/test/unit/src/Project/ProjectWorkspaceManager.test.mjs`
- Test: `services/web/test/unit/src/Project/ProjectFileStore.test.mjs`
- Test: `services/web/test/unit/src/Project/ProjectCheckpointService.test.mjs`
- Test: `services/web/test/unit/src/Project/ProjectStorageMigrationService.test.mjs`

## Phase 1 Assumptions

- Workspace files use UTF-8 for editable text docs.
- File paths exposed to users are project-relative POSIX paths beginning with `/`.
- Internal paths `.git/` and `.superpaper/` are hidden from normal file listing.
- Project ids are converted to strings for filesystem paths.
- Tests may use temp directories under `os.tmpdir()`.
- The implementation should use real filesystem calls in unit tests where practical, and mock only external services such as docstore/filestore.

---

## Phase 1 Task 1: Project Schema Storage Metadata

**Files:**
- Modify: `services/web/app/src/models/Project.mjs`
- Test: `services/web/test/unit/src/Project/ProjectWorkspaceManager.test.mjs`

- [ ] **Step 1: Add a failing schema test for storage metadata defaults**

Create `services/web/test/unit/src/Project/ProjectWorkspaceManager.test.mjs` with this initial test:

```js
import { expect } from 'vitest'
import { Project } from '../../../../app/src/models/Project.mjs'

describe('Project workspace storage metadata', function () {
  it('defaults projects to the mongo storage backend', function () {
    const project = new Project({ name: 'Paper' })

    expect(project.storageBackend).to.equal('mongo')
    expect(project.workspace).to.deep.equal({
      rootPath: null,
      migratedAt: null,
      finalizedAt: null,
    })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs
```

Expected: FAIL because `storageBackend` and `workspace` are missing or undefined.

- [ ] **Step 3: Add project schema fields**

Modify `services/web/app/src/models/Project.mjs` inside `ProjectSchema`:

```js
    storageBackend: {
      type: String,
      enum: ['mongo', 'filesystem'],
      default: 'mongo',
      index: true,
    },
    workspace: {
      rootPath: { type: String, default: null },
      migratedAt: { type: Date, default: null },
      finalizedAt: { type: Date, default: null },
    },
```

Place these fields near other project-level storage/history fields, before `superpaper`.

- [ ] **Step 4: Run the schema test and verify it passes**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web/app/src/models/Project.mjs services/web/test/unit/src/Project/ProjectWorkspaceManager.test.mjs
git commit -m "Add project workspace storage metadata"
```

---

## Phase 1 Task 2: Workspace Path Manager

**Files:**
- Create: `services/web/app/src/Features/Project/ProjectWorkspaceManager.mjs`
- Modify test: `services/web/test/unit/src/Project/ProjectWorkspaceManager.test.mjs`

- [ ] **Step 1: Extend tests for workspace root and path containment**

Replace `services/web/test/unit/src/Project/ProjectWorkspaceManager.test.mjs` with:

```js
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { expect, vi } from 'vitest'
import { Project } from '../../../../app/src/models/Project.mjs'

const modulePath =
  '../../../../app/src/Features/Project/ProjectWorkspaceManager.mjs'

describe('Project workspace storage metadata', function () {
  it('defaults projects to the mongo storage backend', function () {
    const project = new Project({ name: 'Paper' })

    expect(project.storageBackend).to.equal('mongo')
    expect(project.workspace).to.deep.equal({
      rootPath: null,
      migratedAt: null,
      finalizedAt: null,
    })
  })
})

describe('ProjectWorkspaceManager', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-workspaces-')
    )
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    ctx.ProjectWorkspaceManager = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('resolves the workspace root for a project id', function (ctx) {
    expect(
      ctx.ProjectWorkspaceManager.getWorkspaceRoot('project-123')
    ).to.equal(path.join(ctx.tmpRoot, 'project-123', 'workspace'))
  })

  it('normalizes relative project paths to POSIX absolute paths', function (ctx) {
    expect(ctx.ProjectWorkspaceManager.normalizeProjectPath('main.tex')).to.equal(
      '/main.tex'
    )
    expect(
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/sections/intro.tex')
    ).to.equal('/sections/intro.tex')
    expect(
      ctx.ProjectWorkspaceManager.normalizeProjectPath('sections//intro.tex')
    ).to.equal('/sections/intro.tex')
  })

  it('rejects traversal paths', function (ctx) {
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('../secret.tex')
    ).to.throw('Project path escapes the workspace')
  })

  it('rejects internal paths', function (ctx) {
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/.git/config')
    ).to.throw('Project path is internal')
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/.superpaper/project.json')
    ).to.throw('Project path is internal')
  })

  it('rejects sensitive paths', function (ctx) {
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/.env')
    ).to.throw('Project path is sensitive')
    expect(() =>
      ctx.ProjectWorkspaceManager.normalizeProjectPath('/credentials.json')
    ).to.throw('Project path is sensitive')
  })

  it('resolves a contained absolute filesystem path', async function (ctx) {
    const resolved = await ctx.ProjectWorkspaceManager.resolveProjectPath({
      projectId: 'project-123',
      projectPath: '/sections/intro.tex',
    })

    expect(resolved.projectPath).to.equal('/sections/intro.tex')
    expect(resolved.absolutePath).to.equal(
      path.join(ctx.tmpRoot, 'project-123', 'workspace', 'sections', 'intro.tex')
    )
  })
})
```

- [ ] **Step 2: Run the tests and verify containment tests fail**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs
```

Expected: FAIL because `ProjectWorkspaceManager.mjs` does not exist.

- [ ] **Step 3: Create `ProjectWorkspaceManager.mjs`**

Create `services/web/app/src/Features/Project/ProjectWorkspaceManager.mjs`:

```js
import path from 'node:path'
import fs from 'node:fs/promises'
import Settings from '@superpaper/settings'

const INTERNAL_PREFIXES = ['/.git', '/.superpaper']
const SENSITIVE_PATH_PATTERNS = [
  /^\/\.env(?:\.|$)/i,
  /^\/secrets(?:\/|$)/i,
  /^\/credentials\./i,
  /^\/渠道\.txt$/i,
  /\.pem$/i,
  /\.key$/i,
]

export class ProjectWorkspaceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProjectWorkspaceError'
    this.code = code
  }
}

function getConfiguredWorkspaceRoot() {
  const root = Settings.projectWorkspaceRoot
  if (!root) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_ROOT_NOT_CONFIGURED',
      'Project workspace root is not configured'
    )
  }
  return path.resolve(root)
}

function getWorkspaceRoot(projectId) {
  const safeProjectId = String(projectId)
  if (!/^[a-zA-Z0-9_-]+$/.test(safeProjectId)) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INVALID_PROJECT_ID',
      'Project id is not safe for workspace paths'
    )
  }
  return path.join(getConfiguredWorkspaceRoot(), safeProjectId, 'workspace')
}

function normalizeProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INVALID_PATH',
      'Project path is required'
    )
  }
  if (path.isAbsolute(projectPath) && !projectPath.startsWith('/')) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INVALID_PATH',
      'Project path must be project-relative'
    )
  }

  const normalized = path.posix.normalize(`/${projectPath.replaceAll('\\', '/')}`)
  if (normalized === '/' || normalized.includes('/../') || normalized === '/..') {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_PATH_ESCAPE',
      'Project path escapes the workspace'
    )
  }
  if (INTERNAL_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INTERNAL_PATH',
      'Project path is internal'
    )
  }
  if (SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(normalized))) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_SENSITIVE_PATH',
      'Project path is sensitive'
    )
  }
  return normalized
}

async function resolveProjectPath({ projectId, projectPath }) {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const workspaceRoot = getWorkspaceRoot(projectId)
  const absolutePath = path.resolve(
    workspaceRoot,
    `.${normalizedProjectPath}`
  )
  assertContainedPath(workspaceRoot, absolutePath)
  await assertNoSymlinkEscape(workspaceRoot, absolutePath)
  return {
    workspaceRoot,
    projectPath: normalizedProjectPath,
    absolutePath,
  }
}

function assertContainedPath(workspaceRoot, absolutePath) {
  const relative = path.relative(workspaceRoot, absolutePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_PATH_ESCAPE',
      'Project path escapes the workspace'
    )
  }
}

async function assertNoSymlinkEscape(workspaceRoot, absolutePath) {
  let cursor = path.dirname(absolutePath)
  const root = path.resolve(workspaceRoot)
  const checked = []
  while (cursor.startsWith(root) && cursor !== root) {
    checked.push(cursor)
    cursor = path.dirname(cursor)
  }
  for (const candidate of checked.reverse()) {
    try {
      const stat = await fs.lstat(candidate)
      if (stat.isSymbolicLink()) {
        const real = await fs.realpath(candidate)
        assertContainedPath(root, real)
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }
  }
}

export default {
  getWorkspaceRoot,
  normalizeProjectPath,
  resolveProjectPath,
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web/app/src/Features/Project/ProjectWorkspaceManager.mjs services/web/test/unit/src/Project/ProjectWorkspaceManager.test.mjs
git commit -m "Add project workspace path manager"
```

---

## Phase 1 Task 3: Workspace File Store

**Files:**
- Create: `services/web/app/src/Features/Project/ProjectFileStore.mjs`
- Test: `services/web/test/unit/src/Project/ProjectFileStore.test.mjs`

- [ ] **Step 1: Write failing file store tests**

Create `services/web/test/unit/src/Project/ProjectFileStore.test.mjs`:

```js
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { expect, vi } from 'vitest'

const modulePath = '../../../../app/src/Features/Project/ProjectFileStore.mjs'

describe('ProjectFileStore', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-file-store-')
    )
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    ctx.ProjectFileStore = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('writes and reads a UTF-8 text file', async function (ctx) {
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/main.tex',
      content: '\\documentclass{article}\n',
    })

    const file = await ctx.ProjectFileStore.readTextFile({
      projectId: 'project-1',
      projectPath: '/main.tex',
    })

    expect(file).to.include({
      projectPath: '/main.tex',
      content: '\\documentclass{article}\n',
    })
    expect(file.bytes).to.equal(Buffer.byteLength(file.content))
    expect(file.sha256).to.match(/^[a-f0-9]{64}$/)
  })

  it('lists visible files and hides internal directories', async function (ctx) {
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/main.tex',
      content: 'main',
    })
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/sections/intro.tex',
      content: 'intro',
    })
    await fs.mkdir(
      path.join(ctx.tmpRoot, 'project-1', 'workspace', '.superpaper'),
      { recursive: true }
    )
    await fs.writeFile(
      path.join(
        ctx.tmpRoot,
        'project-1',
        'workspace',
        '.superpaper',
        'project.json'
      ),
      '{}'
    )

    const files = await ctx.ProjectFileStore.listFiles({ projectId: 'project-1' })

    expect(files.map(file => file.projectPath)).to.deep.equal([
      '/main.tex',
      '/sections/intro.tex',
    ])
  })

  it('renames and deletes files', async function (ctx) {
    await ctx.ProjectFileStore.writeTextFile({
      projectId: 'project-1',
      projectPath: '/old.tex',
      content: 'hello',
    })

    await ctx.ProjectFileStore.renameFile({
      projectId: 'project-1',
      fromPath: '/old.tex',
      toPath: '/new.tex',
    })
    await expect(
      ctx.ProjectFileStore.readTextFile({
        projectId: 'project-1',
        projectPath: '/old.tex',
      })
    ).to.be.rejectedWith('Project file not found')
    expect(
      (
        await ctx.ProjectFileStore.readTextFile({
          projectId: 'project-1',
          projectPath: '/new.tex',
        })
      ).content
    ).to.equal('hello')

    await ctx.ProjectFileStore.deleteFile({
      projectId: 'project-1',
      projectPath: '/new.tex',
    })
    await expect(
      ctx.ProjectFileStore.readTextFile({
        projectId: 'project-1',
        projectPath: '/new.tex',
      })
    ).to.be.rejectedWith('Project file not found')
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectFileStore.test.mjs
```

Expected: FAIL because `ProjectFileStore.mjs` does not exist.

- [ ] **Step 3: Implement `ProjectFileStore.mjs`**

Create `services/web/app/src/Features/Project/ProjectFileStore.mjs`:

```js
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import ProjectWorkspaceManager from './ProjectWorkspaceManager.mjs'

const TEXT_EXTENSIONS = new Set([
  '.tex',
  '.bib',
  '.cls',
  '.sty',
  '.md',
  '.txt',
  '.ltx',
])

export class ProjectFileStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProjectFileStoreError'
    this.code = code
  }
}

async function ensureWorkspace(projectId) {
  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  await fs.mkdir(workspaceRoot, { recursive: true })
  return workspaceRoot
}

async function readTextFile({ projectId, projectPath }) {
  const resolved = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath,
  })
  let content
  try {
    content = await fs.readFile(resolved.absolutePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ProjectFileStoreError(
        'PROJECT_FILE_NOT_FOUND',
        'Project file not found'
      )
    }
    throw err
  }
  return {
    projectPath: resolved.projectPath,
    absolutePath: resolved.absolutePath,
    content,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  }
}

async function writeTextFile({ projectId, projectPath, content }) {
  assertTextPath(projectPath)
  await ensureWorkspace(projectId)
  const resolved = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath,
  })
  await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true })
  await fs.writeFile(resolved.absolutePath, content, 'utf8')
  return {
    projectPath: resolved.projectPath,
    absolutePath: resolved.absolutePath,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  }
}

async function listFiles({ projectId }) {
  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  const files = []
  await walk(workspaceRoot, '/', files)
  return files.sort((a, b) => a.projectPath.localeCompare(b.projectPath))
}

async function renameFile({ projectId, fromPath, toPath }) {
  const from = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath: fromPath,
  })
  const to = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath: toPath,
  })
  await fs.mkdir(path.dirname(to.absolutePath), { recursive: true })
  await fs.rename(from.absolutePath, to.absolutePath)
  return {
    fromPath: from.projectPath,
    toPath: to.projectPath,
  }
}

async function deleteFile({ projectId, projectPath }) {
  const resolved = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath,
  })
  try {
    await fs.rm(resolved.absolutePath, { force: false })
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ProjectFileStoreError(
        'PROJECT_FILE_NOT_FOUND',
        'Project file not found'
      )
    }
    throw err
  }
  return {
    projectPath: resolved.projectPath,
  }
}

async function walk(root, relativeDir, files) {
  let entries
  try {
    entries = await fs.readdir(path.join(root, `.${relativeDir}`), {
      withFileTypes: true,
    })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return
    }
    throw err
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.superpaper') {
      continue
    }
    const projectPath = path.posix.join(relativeDir, entry.name)
    const absolutePath = path.join(root, `.${projectPath}`)
    if (entry.isDirectory()) {
      await walk(root, projectPath, files)
    } else if (entry.isFile()) {
      const stat = await fs.stat(absolutePath)
      files.push({
        projectPath,
        absolutePath,
        bytes: stat.size,
        type: isTextProjectPath(projectPath) ? 'doc' : 'file',
      })
    }
  }
}

function assertTextPath(projectPath) {
  if (!isTextProjectPath(projectPath)) {
    throw new ProjectFileStoreError(
      'PROJECT_FILE_NOT_TEXT',
      'Project path is not an editable text document'
    )
  }
}

function isTextProjectPath(projectPath) {
  return TEXT_EXTENSIONS.has(path.posix.extname(projectPath).toLowerCase())
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export default {
  readTextFile,
  writeTextFile,
  listFiles,
  renameFile,
  deleteFile,
}
```

- [ ] **Step 4: Run file store and workspace manager tests**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web/app/src/Features/Project/ProjectFileStore.mjs services/web/test/unit/src/Project/ProjectFileStore.test.mjs
git commit -m "Add filesystem project file store"
```

---

## Phase 1 Task 4: Git Checkpoint Service

**Files:**
- Create: `services/web/app/src/models/ProjectCheckpoint.mjs`
- Create: `services/web/app/src/Features/Project/ProjectCheckpointService.mjs`
- Test: `services/web/test/unit/src/Project/ProjectCheckpointService.test.mjs`

- [ ] **Step 1: Write failing checkpoint tests**

Create `services/web/test/unit/src/Project/ProjectCheckpointService.test.mjs`:

```js
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { expect, vi } from 'vitest'

const modulePath =
  '../../../../app/src/Features/Project/ProjectCheckpointService.mjs'

describe('ProjectCheckpointService', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-checkpoints-')
    )
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    vi.doMock('../../../../app/src/models/ProjectCheckpoint.mjs', () => ({
      ProjectCheckpoint: (ctx.ProjectCheckpoint = {
        create: vi.fn(async checkpoint => ({
          _id: 'checkpoint-id',
          createdAt: new Date('2026-05-20T00:00:00Z'),
          ...checkpoint,
        })),
      }),
    }))
    ctx.ProjectCheckpointService = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('initializes git and creates a checkpoint commit', async function (ctx) {
    const workspaceRoot = path.join(ctx.tmpRoot, 'project-1', 'workspace')
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, 'main.tex'), 'hello\n')

    const checkpoint = await ctx.ProjectCheckpointService.createCheckpoint({
      projectId: 'project-1',
      actorType: 'migration',
      actorUserId: 'user-1',
      summary: 'Initial migration',
    })

    expect(checkpoint.commitHash).to.match(/^[a-f0-9]{40}$/)
    expect(ctx.ProjectCheckpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        actorType: 'migration',
        actorUserId: 'user-1',
        summary: 'Initial migration',
        commitHash: checkpoint.commitHash,
      })
    )
  })

  it('returns a diff between checkpoints and the worktree', async function (ctx) {
    const workspaceRoot = path.join(ctx.tmpRoot, 'project-1', 'workspace')
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, 'main.tex'), 'hello\n')
    await ctx.ProjectCheckpointService.createCheckpoint({
      projectId: 'project-1',
      actorType: 'migration',
      summary: 'Initial migration',
    })
    await fs.writeFile(path.join(workspaceRoot, 'main.tex'), 'hello world\n')

    const diff = await ctx.ProjectCheckpointService.diffWorktree({
      projectId: 'project-1',
    })

    expect(diff).to.contain('-hello')
    expect(diff).to.contain('+hello world')
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectCheckpointService.test.mjs
```

Expected: FAIL because service/model do not exist.

- [ ] **Step 3: Add `ProjectCheckpoint` model**

Create `services/web/app/src/models/ProjectCheckpoint.mjs`:

```js
import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const ProjectCheckpointSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    commitHash: { type: String, required: true },
    actorType: {
      type: String,
      enum: ['user', 'agent', 'migration', 'system'],
      required: true,
      index: true,
    },
    actorUserId: { type: Schema.Types.ObjectId, default: null },
    agentSessionId: { type: Schema.Types.ObjectId, default: null },
    summary: { type: String, default: '' },
  },
  {
    collection: 'projectCheckpoints',
    minimize: false,
    timestamps: true,
  }
)

ProjectCheckpointSchema.index({ projectId: 1, createdAt: -1 })

export const ProjectCheckpoint = mongoose.model(
  'ProjectCheckpoint',
  ProjectCheckpointSchema
)
```

- [ ] **Step 4: Add checkpoint service**

Create `services/web/app/src/Features/Project/ProjectCheckpointService.mjs`:

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import ProjectWorkspaceManager from './ProjectWorkspaceManager.mjs'
import { ProjectCheckpoint } from '../../models/ProjectCheckpoint.mjs'

const execFileAsync = promisify(execFile)

export class ProjectCheckpointError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProjectCheckpointError'
    this.code = code
  }
}

async function ensureRepository(projectId) {
  const cwd = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  await fs.mkdir(cwd, { recursive: true })
  if (!(await exists(`${cwd}/.git`))) {
    await git(cwd, ['init'])
    await git(cwd, ['config', 'user.name', 'superPaper'])
    await git(cwd, ['config', 'user.email', 'superpaper@example.invalid'])
  }
  return cwd
}

async function createCheckpoint({
  projectId,
  actorType,
  actorUserId = null,
  agentSessionId = null,
  summary = '',
}) {
  const cwd = await ensureRepository(projectId)
  await git(cwd, ['add', '--all'])
  const hasChanges = await hasStagedChanges(cwd)
  if (hasChanges) {
    await git(cwd, ['commit', '-m', summary || 'superPaper checkpoint'])
  }
  const commitHash = (await git(cwd, ['rev-parse', 'HEAD'])).trim()
  return await ProjectCheckpoint.create({
    projectId,
    commitHash,
    actorType,
    actorUserId,
    agentSessionId,
    summary,
  })
}

async function diffWorktree({ projectId }) {
  const cwd = await ensureRepository(projectId)
  return await git(cwd, ['diff', '--', '.'])
}

async function restoreCommit({ projectId, commitHash }) {
  const cwd = await ensureRepository(projectId)
  await git(cwd, ['checkout', commitHash, '--', '.'])
  return { commitHash }
}

async function hasStagedChanges(cwd) {
  try {
    await git(cwd, ['diff', '--cached', '--quiet'])
    return false
  } catch (err) {
    if (err.exitCode === 1) {
      return true
    }
    throw err
  }
}

async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    })
    return stdout
  } catch (err) {
    const wrapped = new ProjectCheckpointError(
      'PROJECT_CHECKPOINT_GIT_FAILED',
      'Project checkpoint git command failed'
    )
    wrapped.cause = err
    wrapped.exitCode = err.code
    throw wrapped
  }
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export default {
  ensureRepository,
  createCheckpoint,
  diffWorktree,
  restoreCommit,
}
```

- [ ] **Step 5: Run checkpoint tests**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectCheckpointService.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/web/app/src/models/ProjectCheckpoint.mjs services/web/app/src/Features/Project/ProjectCheckpointService.mjs services/web/test/unit/src/Project/ProjectCheckpointService.test.mjs
git commit -m "Add project git checkpoint service"
```

---

## Phase 1 Task 5: Mongo-To-Workspace Migration Export

**Files:**
- Create: `services/web/app/src/Features/Project/ProjectStorageMigrationService.mjs`
- Test: `services/web/test/unit/src/Project/ProjectStorageMigrationService.test.mjs`

- [ ] **Step 1: Write failing migration export tests**

Create `services/web/test/unit/src/Project/ProjectStorageMigrationService.test.mjs`:

```js
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/Project/ProjectStorageMigrationService.mjs'

describe('ProjectStorageMigrationService', function () {
  beforeEach(async function (ctx) {
    ctx.tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'superpaper-migration-')
    )
    ctx.project = {
      _id: 'project-1',
      name: 'Migrated Paper',
      rootDoc_id: 'doc-main',
      compiler: 'pdflatex',
      storageBackend: 'mongo',
      workspace: {},
      save: sinon.stub().resolvesThis(),
    }
    ctx.docs = {
      '/main.tex': {
        _id: 'doc-main',
        lines: ['\\documentclass{article}', '\\begin{document}', 'Hi'],
        rev: 3,
      },
      '/sections/intro.tex': {
        _id: 'doc-intro',
        lines: ['Intro'],
        rev: 1,
      },
    }
    ctx.files = {
      '/figures/plot.pdf': {
        _id: 'file-1',
        name: 'plot.pdf',
      },
    }
    vi.doMock('@superpaper/settings', () => ({
      default: {
        projectWorkspaceRoot: ctx.tmpRoot,
      },
    }))
    vi.doMock('../../../../app/src/Features/Project/ProjectGetter.mjs', () => ({
      default: {
        promises: {
          getProject: sinon.stub().resolves(ctx.project),
        },
      },
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler.mjs',
      () => ({
        default: {
          promises: {
            getAllDocs: sinon.stub().resolves(ctx.docs),
            getAllFiles: sinon.stub().resolves(ctx.files),
          },
        },
      })
    )
    vi.doMock(
      '../../../../app/src/Features/FileStore/FileStoreHandler.mjs',
      () => ({
        default: {
          promises: {
            getFileStream: sinon.stub().callsFake(async () => ({
              pipe() {},
            })),
          },
        },
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectCheckpointService.mjs',
      () => ({
        default: {
          createCheckpoint: sinon.stub().resolves({
            commitHash: 'a'.repeat(40),
          }),
        },
      })
    )
    ctx.ProjectStorageMigrationService = (await import(modulePath)).default
  })

  afterEach(async function (ctx) {
    vi.resetModules()
    vi.doUnmock('@superpaper/settings')
    await fs.rm(ctx.tmpRoot, { recursive: true, force: true })
  })

  it('exports docs and project metadata into a workspace', async function (ctx) {
    const result =
      await ctx.ProjectStorageMigrationService.migrateProjectToFilesystem({
        projectId: 'project-1',
        userId: 'user-1',
      })

    const workspaceRoot = path.join(ctx.tmpRoot, 'project-1', 'workspace')
    expect(
      await fs.readFile(path.join(workspaceRoot, 'main.tex'), 'utf8')
    ).to.equal('\\documentclass{article}\n\\begin{document}\nHi')
    expect(
      await fs.readFile(path.join(workspaceRoot, 'sections', 'intro.tex'), 'utf8')
    ).to.equal('Intro')
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(workspaceRoot, '.superpaper', 'project.json'),
          'utf8'
        )
      )
    ).to.include({
      projectId: 'project-1',
      name: 'Migrated Paper',
      rootDocId: 'doc-main',
      compiler: 'pdflatex',
    })
    expect(ctx.project.storageBackend).to.equal('filesystem')
    expect(ctx.project.workspace.rootPath).to.equal(workspaceRoot)
    expect(ctx.project.save.called).to.equal(true)
    expect(result.workspaceRoot).to.equal(workspaceRoot)
    expect(result.checkpoint.commitHash).to.equal('a'.repeat(40))
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectStorageMigrationService.test.mjs
```

Expected: FAIL because migration service does not exist.

- [ ] **Step 3: Implement migration service**

Create `services/web/app/src/Features/Project/ProjectStorageMigrationService.mjs`:

```js
import path from 'node:path'
import fs from 'node:fs/promises'
import ProjectGetter from './ProjectGetter.mjs'
import ProjectEntityHandler from './ProjectEntityHandler.mjs'
import ProjectWorkspaceManager from './ProjectWorkspaceManager.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'
import ProjectCheckpointService from './ProjectCheckpointService.mjs'

async function migrateProjectToFilesystem({ projectId, userId }) {
  const project = await ProjectGetter.promises.getProject(projectId)
  if (!project) {
    throw new Error('project not found')
  }
  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  await fs.mkdir(workspaceRoot, { recursive: true })

  const [docs] = await Promise.all([
    ProjectEntityHandler.promises.getAllDocs(projectId),
    ProjectEntityHandler.promises.getAllFiles(projectId),
  ])

  for (const [projectPath, doc] of Object.entries(docs)) {
    await ProjectFileStore.writeTextFile({
      projectId,
      projectPath,
      content: Array.isArray(doc.lines) ? doc.lines.join('\n') : '',
    })
  }

  await writeProjectMetadata({ project, projectId, workspaceRoot })
  const checkpoint = await ProjectCheckpointService.createCheckpoint({
    projectId,
    actorType: 'migration',
    actorUserId: userId,
    summary: 'Migrate project to filesystem workspace',
  })

  project.storageBackend = 'filesystem'
  project.workspace = {
    rootPath: workspaceRoot,
    migratedAt: new Date(),
    finalizedAt: null,
  }
  await project.save()

  return {
    projectId,
    workspaceRoot,
    checkpoint,
  }
}

async function writeProjectMetadata({ project, projectId, workspaceRoot }) {
  const metadataPath = path.join(workspaceRoot, '.superpaper', 'project.json')
  await fs.mkdir(path.dirname(metadataPath), { recursive: true })
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        projectId: String(projectId),
        name: project.name,
        rootDocId: project.rootDoc_id?.toString?.() || project.rootDoc_id || null,
        compiler: project.compiler || null,
        migratedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

export default {
  migrateProjectToFilesystem,
}
```

- [ ] **Step 4: Run migration tests**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectStorageMigrationService.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run all Phase 1 tests together**

Run:

```bash
yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/web/app/src/Features/Project/ProjectStorageMigrationService.mjs services/web/test/unit/src/Project/ProjectStorageMigrationService.test.mjs
git commit -m "Add filesystem project migration export"
```

---

## Phase 1 Task 6: Plan And Spec Traceability

**Files:**
- Modify: `docs/superpowers/plans/2026-05-20-cline-filesystem-project-runtime.md`

- [ ] **Step 1: Verify Phase 1 coverage against the spec**

Run:

```bash
rg -n "ProjectWorkspaceManager|ProjectFileStore|ProjectCheckpointService|ProjectStorageMigrationService|ClineAgentRuntimeAdapter|ProjectWorkspaceWatcher" docs/superpowers/specs/2026-05-20-cline-filesystem-project-runtime-design.md docs/superpowers/plans/2026-05-20-cline-filesystem-project-runtime.md
```

Expected: The first four services are covered by Phase 1 tasks. `ClineAgentRuntimeAdapter` and `ProjectWorkspaceWatcher` appear as later phases, not Phase 1 tasks.

- [ ] **Step 2: Run formatting checks for docs and changed JS**

Run:

```bash
yarn format:monorepo-check docs/superpowers/specs/2026-05-20-cline-filesystem-project-runtime-design.md docs/superpowers/plans/2026-05-20-cline-filesystem-project-runtime.md
```

Expected: PASS or report exact formatting changes needed.

- [ ] **Step 3: Commit plan updates if any**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-05-20-cline-filesystem-project-runtime.md
git commit -m "Add Cline filesystem project runtime implementation plan"
```

Expected: Commit succeeds if the plan was not already committed.

