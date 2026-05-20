# Filesystem Workspace Watcher Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect direct Cline/workspace file changes and refresh connected editor file trees from the canonical workspace.

**Architecture:** Add a backend `ProjectWorkspaceWatcher` that tracks filesystem project snapshots with a lightweight polling loop, ignores internal directories through `ProjectFileStore`, and emits a single `project:filesystem:changed` socket event. Add a refresh path that rebuilds the editor project view from workspace-derived `rootFolder`, and make the frontend refresh project context when that event arrives.

**Tech Stack:** Node.js ESM, Vitest, React hooks, existing `ProjectFileStore`, `ProjectEntityHandler`, `ProjectEditorHandler`, `EditorRealTimeController`, existing `/project/:id/join` response shape.

---

## Files

- Create: `services/web/app/src/Features/Project/ProjectWorkspaceWatcher.mjs`
  - Poll workspace file snapshots.
  - Emit coalesced change events.
  - Start/stop project watchers.
- Create: `services/web/test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs`
  - Cover add/change/delete detection, internal path filtering by relying on `ProjectFileStore.listFiles`, and stop behavior.
- Modify: `services/web/app/src/Features/Project/ProjectEditorHandler.mjs`
  - Build filesystem project model views with workspace-derived `rootFolder`.
- Modify: `services/web/test/unit/src/Project/ProjectEditorHandler.test.mjs`
  - Cover filesystem project view root folder.
- Modify: `services/web/app/src/Features/Editor/EditorHttpController.mjs`
  - Start watcher on filesystem project join.
- Modify: `services/web/test/unit/src/Editor/EditorHttpController.test.mjs`
  - Cover watcher start on filesystem join.
- Modify: `services/web/frontend/js/features/ide-react/hooks/use-socket-listeners.ts`
  - Listen for `project:filesystem:changed`.
  - Re-fetch join project payload and update project context.
- Create: `services/web/test/frontend/features/file-tree/filesystem-change-listener.test.tsx`
  - Cover frontend refresh behavior from socket event.

## Task 1: Backend Workspace Watcher Service

- [ ] **Step 1: Add failing watcher tests**

Create `services/web/test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs`:

```js
import { vi, expect } from 'vitest'
import sinon from 'sinon'

const MODULE_PATH =
  '../../../../app/src/Features/Project/ProjectWorkspaceWatcher.mjs'

describe('ProjectWorkspaceWatcher', function () {
  beforeEach(async function (ctx) {
    vi.useFakeTimers()
    ctx.ProjectFileStore = {
      listFiles: sinon.stub().resolves([]),
    }
    ctx.EditorRealTimeController = {
      emitToRoom: sinon.stub(),
    }
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectFileStore.mjs',
      () => ({
        default: ctx.ProjectFileStore,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Editor/EditorRealTimeController.mjs',
      () => ({
        default: ctx.EditorRealTimeController,
      })
    )
    ctx.ProjectWorkspaceWatcher = (await import(MODULE_PATH)).default
  })

  afterEach(function () {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('emits a coalesced filesystem change when files are added', async function (ctx) {
    ctx.ProjectFileStore.listFiles.onFirstCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
    ])
    ctx.ProjectFileStore.listFiles.onSecondCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
      { projectPath: '/sections/intro.tex', bytes: 5, type: 'doc' },
    ])

    await ctx.ProjectWorkspaceWatcher.start('project-1', { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
      'project-1',
      'project:filesystem:changed',
      {
        projectId: 'project-1',
        changedPaths: ['/sections/intro.tex'],
        reason: 'workspace-files-changed',
      }
    )
  })

  it('emits changed and deleted paths', async function (ctx) {
    ctx.ProjectFileStore.listFiles.onFirstCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
      { projectPath: '/old.tex', bytes: 3, type: 'doc' },
    ])
    ctx.ProjectFileStore.listFiles.onSecondCall().resolves([
      { projectPath: '/main.tex', bytes: 8, type: 'doc' },
    ])

    await ctx.ProjectWorkspaceWatcher.start('project-1', { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
      'project-1',
      'project:filesystem:changed',
      {
        projectId: 'project-1',
        changedPaths: ['/main.tex', '/old.tex'],
        reason: 'workspace-files-changed',
      }
    )
  })

  it('stops polling a project', async function (ctx) {
    ctx.ProjectFileStore.listFiles.onFirstCall().resolves([
      { projectPath: '/main.tex', bytes: 4, type: 'doc' },
    ])
    ctx.ProjectFileStore.listFiles.onSecondCall().resolves([
      { projectPath: '/main.tex', bytes: 5, type: 'doc' },
    ])

    await ctx.ProjectWorkspaceWatcher.start('project-1', { intervalMs: 1000 })
    ctx.ProjectWorkspaceWatcher.stop('project-1')
    await vi.advanceTimersByTimeAsync(1000)

    expect(ctx.EditorRealTimeController.emitToRoom).not.to.have.been.called
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs
```

Expected: FAIL because `ProjectWorkspaceWatcher.mjs` does not exist.

- [ ] **Step 3: Implement watcher service**

Create `services/web/app/src/Features/Project/ProjectWorkspaceWatcher.mjs`:

```js
import ProjectFileStore from './ProjectFileStore.mjs'
import EditorRealTimeController from '../Editor/EditorRealTimeController.mjs'
import logger from '@superpaper/logger'

const DEFAULT_INTERVAL_MS = 1500
const watchers = new Map()

async function start(projectId, options = {}) {
  const key = String(projectId)
  if (watchers.has(key)) {
    return watchers.get(key)
  }
  const state = {
    projectId: key,
    intervalMs: options.intervalMs || DEFAULT_INTERVAL_MS,
    snapshot: await takeSnapshot(key),
    timer: null,
    polling: false,
  }
  state.timer = setInterval(() => {
    poll(state).catch(err => {
      logger.warn({ err, projectId: key }, 'workspace watcher poll failed')
    })
  }, state.intervalMs)
  watchers.set(key, state)
  return state
}

function stop(projectId) {
  const key = String(projectId)
  const state = watchers.get(key)
  if (!state) return
  clearInterval(state.timer)
  watchers.delete(key)
}

async function poll(state) {
  if (state.polling) return
  state.polling = true
  try {
    const next = await takeSnapshot(state.projectId)
    const changedPaths = diffSnapshots(state.snapshot, next)
    state.snapshot = next
    if (changedPaths.length > 0) {
      EditorRealTimeController.emitToRoom(
        state.projectId,
        'project:filesystem:changed',
        {
          projectId: state.projectId,
          changedPaths,
          reason: 'workspace-files-changed',
        }
      )
    }
  } finally {
    state.polling = false
  }
}

async function takeSnapshot(projectId) {
  const entries = await ProjectFileStore.listFiles({ projectId })
  return new Map(
    entries.map(entry => [
      entry.projectPath,
      `${entry.type}:${entry.bytes}:${entry.sha256 || ''}`,
    ])
  )
}

function diffSnapshots(previous, next) {
  const changed = new Set()
  for (const [projectPath, signature] of next.entries()) {
    if (previous.get(projectPath) !== signature) {
      changed.add(projectPath)
    }
  }
  for (const projectPath of previous.keys()) {
    if (!next.has(projectPath)) {
      changed.add(projectPath)
    }
  }
  return Array.from(changed).sort()
}

export default {
  start,
  stop,
  poll,
  takeSnapshot,
  diffSnapshots,
}
```

- [ ] **Step 4: Run watcher tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs
```

Expected: PASS.

## Task 2: Project View Uses Workspace File Tree

- [ ] **Step 1: Add failing project editor handler test**

In `services/web/test/unit/src/Project/ProjectEditorHandler.test.mjs`, add module mocks and a filesystem project test. If the file imports the handler at top-level, change it to dynamic import after mocks.

Add:

```js
  describe('filesystem project view', function () {
    beforeEach(async function (ctx) {
      vi.resetModules()
      ctx.ProjectEntityHandler = {
        buildFilesystemRootFolder: sinon.stub().returns({
          _id: 'workspace-root-id',
          name: 'rootFolder',
          docs: [{ _id: 'doc-id', name: 'main.tex' }],
          fileRefs: [],
          folders: [],
        }),
      }
      ctx.ProjectFileStore = {
        listFiles: sinon.stub().resolves([
          { projectPath: '/main.tex', type: 'doc', bytes: 4 },
        ]),
      }
      vi.doMock(
        '../../../../app/src/Features/Project/ProjectEntityHandler.mjs',
        () => ({
          default: ctx.ProjectEntityHandler,
        })
      )
      vi.doMock(
        '../../../../app/src/Features/Project/ProjectFileStore.mjs',
        () => ({
          default: ctx.ProjectFileStore,
        })
      )
      ctx.ProjectEditorHandler = (await import(modulePath)).default
      ctx.project.storageBackend = 'filesystem'
      ctx.result =
        await ctx.ProjectEditorHandler.buildProjectModelView(
          ctx.project,
          ctx.ownerMember,
          ctx.members,
          ctx.invites,
          false
        )
    })

    it('builds rootFolder from workspace files', function (ctx) {
      expect(ctx.ProjectFileStore.listFiles).to.have.been.calledWith({
        projectId: ctx.project._id,
      })
      expect(ctx.ProjectEntityHandler.buildFilesystemRootFolder).to.have.been.called
      expect(ctx.result.rootFolder[0].docs[0].name).to.equal('main.tex')
    })
  })
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEditorHandler.test.mjs
```

Expected: FAIL because `buildProjectModelView` is synchronous and uses `project.rootFolder`.

- [ ] **Step 3: Implement async project model view**

Modify `services/web/app/src/Features/Project/ProjectEditorHandler.mjs`:

```js
import ProjectEntityHandler from './ProjectEntityHandler.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'
```

Change `buildProjectModelView` to `async buildProjectModelView(...)`, and before `const result = { ... }` add:

```js
    let rootFolder = project.rootFolder?.[0]
    if (project.storageBackend === 'filesystem') {
      const entries = await ProjectFileStore.listFiles({ projectId: project._id })
      rootFolder = ProjectEntityHandler.buildFilesystemRootFolder(entries)
    }
```

Then use:

```js
      rootFolder: [this.buildFolderModelView(rootFolder)],
```

Update `services/web/app/src/Features/Editor/EditorHttpController.mjs` to await the view:

```js
    project: await ProjectEditorHandler.buildProjectModelView(
      project,
      ownerMember,
      members,
      invites,
      isRestrictedUser
    ),
```

- [ ] **Step 4: Run backend view tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEditorHandler.test.mjs test/unit/src/Editor/EditorHttpController.test.mjs
```

Expected: PASS after updating existing test mocks to resolve async `buildProjectModelView`.

## Task 3: Start Watcher On Filesystem Project Join

- [ ] **Step 1: Add failing join test**

In `services/web/test/unit/src/Editor/EditorHttpController.test.mjs`, mock `ProjectWorkspaceWatcher` in top-level setup:

```js
    ctx.ProjectWorkspaceWatcher = {
      start: sinon.stub().resolves(),
    }
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectWorkspaceWatcher.mjs',
      () => ({
        default: ctx.ProjectWorkspaceWatcher,
      })
    )
```

Inside `describe('joinProject')`, add:

```js
    describe('with a filesystem project', function () {
      beforeEach(async function (ctx) {
        ctx.project.storageBackend = 'filesystem'
        await new Promise(resolve => {
          ctx.res.callback = resolve
          ctx.EditorHttpController.joinProject(ctx.req, ctx.res)
        })
      })

      it('starts the workspace watcher', function (ctx) {
        expect(ctx.ProjectWorkspaceWatcher.start).to.have.been.calledWith(
          ctx.project._id.toString()
        )
      })
    })
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Editor/EditorHttpController.test.mjs
```

Expected: FAIL because the watcher is not started.

- [ ] **Step 3: Implement watcher start**

In `services/web/app/src/Features/Editor/EditorHttpController.mjs`, import:

```js
import ProjectWorkspaceWatcher from '../Project/ProjectWorkspaceWatcher.mjs'
```

After `_buildJoinProjectView` returns a non-null project and before `res.json`, add:

```js
  if (project.storageBackend === 'filesystem') {
    await ProjectWorkspaceWatcher.start(projectId)
  }
```

Make sure `ProjectEditorHandler.buildProjectModelView` includes `storageBackend` in the project view:

```js
      storageBackend: project.storageBackend,
```

- [ ] **Step 4: Run join tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Editor/EditorHttpController.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs
```

Expected: PASS.

## Task 4: Frontend Refreshes Project On Filesystem Change Event

- [ ] **Step 1: Add failing frontend test**

Create `services/web/test/frontend/features/file-tree/filesystem-change-listener.test.tsx` with a focused hook/component test. Use existing frontend test helpers for React rendering.

```tsx
import { expect } from 'chai'
import sinon from 'sinon'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { EventEmitter } from 'events'
import useSocketListeners from '../../../../frontend/js/features/ide-react/hooks/use-socket-listeners'
import { ProjectContext } from '../../../../frontend/js/shared/context/project-context'
import { IdeReactContext } from '../../../../frontend/js/features/ide-react/context/ide-react-context'
import { ModalsContext } from '../../../../frontend/js/features/ide-react/context/modals-context'
import { ConnectionContext } from '../../../../frontend/js/features/ide-react/context/connection-context'
import * as FetchJson from '../../../../frontend/js/infrastructure/fetch-json'

describe('filesystem change socket listener', function () {
  it('refreshes project metadata from join endpoint', async function () {
    const socket = new EventEmitter() as any
    socket.removeListener = socket.off.bind(socket)
    const updateProject = sinon.stub()
    sinon.stub(FetchJson, 'postJSON').resolves({
      project: {
        _id: 'project-1',
        rootFolder: [{ _id: 'root-2', name: 'rootFolder', docs: [], fileRefs: [], folders: [] }],
      },
      privilegeLevel: 'owner',
      isRestrictedUser: false,
      isTokenMember: false,
      isInvitedMember: false,
    } as any)

    function TestHarness() {
      useSocketListeners()
      return null
    }

    render(
      <ConnectionContext.Provider value={{ socket } as any}>
        <IdeReactContext.Provider
          value={{
            projectId: 'project-1',
            eventEmitter: new EventEmitter() as any,
            reportError: sinon.stub(),
            projectJoined: true,
            permissionsLevel: 'owner',
            setPermissionsLevel: sinon.stub(),
            setOutOfSync: sinon.stub(),
          }}
        >
          <ProjectContext.Provider
            value={{
              projectId: 'project-1',
              project: { _id: 'project-1', rootFolder: [] } as any,
              updateProject,
              joinProject: sinon.stub(),
              joinedOnce: true,
              projectSnapshot: {} as any,
              tags: [],
              features: {},
              name: 'Project',
            }}
          >
            <ModalsContext.Provider value={{ showGenericMessageModal: sinon.stub() } as any}>
              <TestHarness />
            </ModalsContext.Provider>
          </ProjectContext.Provider>
        </IdeReactContext.Provider>
      </ConnectionContext.Provider>
    )

    socket.emit('project:filesystem:changed', {
      projectId: 'project-1',
      changedPaths: ['/main.tex'],
    })

    await waitFor(() => {
      expect(updateProject).to.have.been.calledWith({
        rootFolder: [{ _id: 'root-2', name: 'rootFolder', docs: [], fileRefs: [], folders: [] }],
      })
    })
  })
})
```

- [ ] **Step 2: Run frontend test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:frontend --grep "filesystem change socket listener"
```

Expected: FAIL because no frontend listener handles `project:filesystem:changed`.

- [ ] **Step 3: Implement frontend refresh listener**

In `services/web/frontend/js/features/ide-react/hooks/use-socket-listeners.ts`, import:

```ts
import { postJSON } from '@/infrastructure/fetch-json'
import getMeta from '@/utils/meta'
```

Inside `useSocketListeners`, add:

```ts
  useSocketListener(
    socket,
    'project:filesystem:changed',
    useCallback(() => {
      const userId = getMeta('ol-anonymous')
        ? 'anonymous-user'
        : getMeta('ol-user_id')
      postJSON(`/project/${projectId}/join`, {
        body: {
          userId,
        },
      })
        .then(({ project }: any) => {
          updateProject({ rootFolder: project.rootFolder })
        })
        .catch(err => {
          debugConsole.error('Error refreshing project after filesystem change', err)
        })
    }, [projectId, updateProject])
  )
```

- [ ] **Step 4: Run frontend test**

Run:

```bash
corepack yarn --cwd services/web test:frontend --grep "filesystem change socket listener"
```

Expected: PASS.

## Task 5: Final Verification And Commit

- [ ] **Step 1: Run backend watcher/view tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Project/ProjectEditorHandler.test.mjs test/unit/src/Editor/EditorHttpController.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run Phase 1-5 backend regression set**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectEntityHandler.test.mjs test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs test/unit/src/Project/ProjectEditorHandler.test.mjs test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs test/unit/src/Compile/ClsiManager.test.mjs test/unit/src/Editor/EditorHttpController.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run frontend filesystem listener test**

Run:

```bash
corepack yarn --cwd services/web test:frontend --grep "filesystem change socket listener"
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add services/web/app/src/Features/Project/ProjectWorkspaceWatcher.mjs services/web/test/unit/src/Project/ProjectWorkspaceWatcher.test.mjs services/web/app/src/Features/Project/ProjectEditorHandler.mjs services/web/test/unit/src/Project/ProjectEditorHandler.test.mjs services/web/app/src/Features/Editor/EditorHttpController.mjs services/web/test/unit/src/Editor/EditorHttpController.test.mjs services/web/frontend/js/features/ide-react/hooks/use-socket-listeners.ts services/web/test/frontend/features/file-tree/filesystem-change-listener.test.tsx docs/superpowers/plans/2026-05-20-filesystem-workspace-watcher-sync.md
git commit -m "Sync editor file tree from workspace changes"
```
