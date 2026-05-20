# Cline Filesystem Project Runtime Design

Date: 2026-05-20
Status: Ready for user review

## Decision

superPaper will move project source files to a filesystem-backed, git-checkpointed workspace and run a single Cline agent directly against that workspace. The workspace becomes the canonical source for LaTeX project documents and uploaded project files. There is no intermediate mirror-and-import path in the target architecture.

This design intentionally replaces the current Mongo-doc-first editing model for project files. Mongo remains available for project metadata, permissions, sessions, comments, settings, audit events, and migration bookkeeping, but not as the primary source of `.tex`, `.bib`, `.cls`, `.sty`, image, or attachment contents.

This is the single approved route for the next implementation plan. It does not keep alternative integration paths in scope.

## Goals

- Let Cline modify real superPaper/Overleaf project files directly.
- Keep the browser editor, file tree, compiler, history, and agent looking at the same canonical files.
- Use one Cline agent per user task. Do not introduce multi-agent teams or subagents.
- Prefer Cline SDK/Core capabilities over a hand-written agent loop.
- Keep self-hosted/small-team deployment as the primary target.
- Preserve permission checks, auditability, and recoverability around edits.

## Non-Goals

- Do not build a hybrid long-term model where Cline edits a temporary mirror and superPaper imports diffs back into Mongo docs.
- Do not integrate Roo, Continue, Aider, OpenHands, or VS Code extension code as dependencies.
- Do not implement multi-agent orchestration in this route.
- Do not preserve Mongo doc lines as the canonical source for migrated projects.
- Do not expose arbitrary workspace paths outside project roots.

## Target Storage Model

Each project has a canonical workspace directory:

```text
<project-storage-root>/<projectId>/workspace/
  main.tex
  sections/intro.tex
  refs.bib
  figures/plot.pdf
  .superpaper/
    project.json
    locks/
    snapshots/
```

The storage root is configured by admins, for example:

```text
Settings.projectWorkspaceRoot = /var/lib/superpaper/projects
```

Project metadata remains in Mongo and points to the workspace root. The file tree is derived from the workspace filesystem with policy filters:

- hide internal `.superpaper/`
- block `.git/` direct browser access except through history APIs
- block sensitive names such as `.env`, private keys, and credentials
- allow LaTeX project files and uploaded assets needed for compilation

## Git Checkpoints

Each project workspace is initialized as a git repository owned by superPaper. superPaper commits checkpoints for meaningful state transitions:

- after migration
- before and after agent runs
- before and after browser-editor save batches
- before and after accepted destructive operations
- after successful rollback

Git is not exposed as an unrestricted user shell. It is a storage/history primitive behind superPaper APIs.

Checkpoint metadata is recorded in Mongo:

- project id
- commit hash
- actor type: user, agent, migration, system
- actor user id when available
- related agent session id when available
- summary
- created timestamp

## Editor And Collaboration

The browser editor reads file contents from the workspace. Editing writes are serialized through a project file service, not direct client filesystem writes.

The first implementation can keep the current browser collaboration surface while replacing persistence behind it:

1. Open document reads workspace file text.
2. Editor changes continue to flow through existing server APIs and real-time broadcast.
3. Persistence writes the updated file text to workspace.
4. File watchers detect out-of-band Cline changes and notify connected editor sessions.
5. If a connected user has local unsaved edits while Cline modifies the same file, superPaper marks the file conflicted and asks the user to reload, merge, or keep local changes.

This keeps the agent and editor on the same real files without requiring Cline to speak Overleaf operational transform protocols.

## Agent Runtime

superPaper uses Cline SDK/Core as the only agent runtime for this route.

The default integration uses `@cline/core` or `@cline/sdk` with:

- `cwd` set to the project workspace directory
- one agent session per user task
- spawn/team features disabled
- Cline default read/search/apply patch tools enabled inside the project workspace
- shell enabled according to project/admin policy
- MCP enabled only for admin-approved servers
- superPaper system prompt focused on LaTeX project work

The current `AiAgentRuntime` hand-written loop is replaced by a Cline adapter. Existing `AgentSession` and `AgentEvent` models may remain as the superPaper-visible session and audit surface, but they become adapters around Cline events rather than the source of the tool loop.

### Cline Runtime Boundary

The adapter is responsible for:

- creating Cline sessions
- passing provider credentials from existing encrypted provider settings
- setting `cwd` to the canonical workspace
- mapping Cline event stream to `AgentEvent`
- creating before/after git checkpoints
- acquiring project write locks for mutating runs
- enforcing path containment under the workspace
- relaying output to the browser workbench
- disposing idle sessions

## Agent Workbench UI

The UI remains inside the superPaper project workspace experience, not a separate VS Code or code-server UI.

The workbench shows:

- prompt composer
- selected provider/model
- Cline event stream
- file changes grouped by run
- command/tool output
- compile output
- checkpoint before/after links
- restore controls

The current agent panel can be replaced or heavily rewritten. The important product behavior is that Cline edits appear immediately in the project file tree and open editor tabs after filesystem events are processed.

## Compile

Compilation runs from the canonical workspace directory. Compile output reads exactly the files Cline and the editor modify.

Compile service changes:

- use workspace path as compile root
- resolve root document from project metadata or detected main file
- stream logs into compile UI and agent events
- record compile result against checkpoint hash
- let Cline run compile-related shell commands when enabled, but keep superPaper compile as the authoritative project compile API

## File Watching And Sync

superPaper runs a workspace watcher for each active project or active editor session.

Watcher responsibilities:

- detect Cline-created, modified, renamed, and deleted files
- invalidate file tree cache
- notify open browser sessions
- update open tabs when files have no local unsaved edits
- mark conflicts when local unsaved edits exist
- record agent-caused file changes in audit events

The watcher treats `.git/` and `.superpaper/` as internal.

## Locks And Conflict Policy

Mutating agent runs acquire a project write lock. The lock prevents simultaneous agent runs and destructive project operations. Normal user editing can continue, but same-file collisions are detected.

Initial collision policy:

- If Cline changes a file that is open without unsaved local edits, reload the editor buffer and show a passive notice.
- If Cline changes a file with unsaved local edits, freeze auto-reload and show a conflict action.
- If a user saves a file that changed on disk since it was opened, require explicit overwrite or merge.
- If Cline tries to operate outside the project workspace, deny the action and record a policy event.

This is intentionally conservative. It avoids silent data loss while still allowing direct agent editing.

## Migration

Migration converts existing Mongo-backed projects into filesystem-backed projects.

Migration steps:

1. Create workspace directory.
2. Export Mongo docs to text files at their project paths.
3. Export uploaded files to their project paths.
4. Write `.superpaper/project.json` with root doc and metadata.
5. Initialize git repository.
6. Commit migration checkpoint.
7. Mark project storage backend as `filesystem`.
8. Keep old Mongo doc/file records read-only until migration verification passes.

Rollback of migration is allowed until the project is marked finalized. After finalization, the workspace is canonical.

## API And Service Boundaries

New or rewritten service boundaries:

- `ProjectWorkspaceManager`: resolves and validates workspace paths.
- `ProjectFileStore`: read, write, list, create, delete, rename, move files.
- `ProjectCheckpointService`: git init, commit, diff, restore.
- `ProjectWorkspaceWatcher`: filesystem event fan-out.
- `ClineAgentRuntimeAdapter`: Cline session lifecycle and event mapping.
- `ProjectStorageMigrationService`: Mongo-to-workspace migration.

Existing controllers should call these services instead of reaching into Mongo doc content directly.

## Security

Path containment is mandatory:

- normalize all paths
- reject absolute user paths
- reject traversal above workspace root
- reject symlink escapes
- block configured sensitive path patterns

Shell and MCP are admin-controlled. For self-hosted usage they can be enabled, but they still run with:

- project workspace as cwd
- environment allowlist
- timeout controls
- output redaction
- audit events

Provider API keys remain encrypted server-side and are never sent to the browser.

## Implementation Order

1. Add filesystem workspace configuration and path containment service.
2. Add project file store over workspace files.
3. Add migration service for a test project.
4. Switch file tree and document open/read paths to support filesystem backend.
5. Switch document save path to write workspace files for filesystem projects.
6. Switch compile to workspace source for filesystem projects.
7. Add git checkpoint service.
8. Add Cline adapter with single-agent runs against workspace cwd.
9. Add watcher-driven editor/file-tree refresh.
10. Replace agent panel with Cline event workbench.
11. Add admin migration controls and backend selection visibility.
12. Finalize migration path and remove Mongo-doc-first assumptions from migrated projects.

## Verification Strategy

Use a small migrated LaTeX project first.

Backend verification:

- path containment unit tests
- file store create/read/write/delete/rename tests
- migration export tests
- checkpoint commit/diff/restore tests
- compile-from-workspace integration test
- Cline adapter event mapping tests with mocked Cline runtime

Browser verification:

- open migrated project
- edit and save `.tex`
- create/rename/delete file
- run compile
- run Cline agent to edit a `.tex` file
- see open editor update after agent write
- trigger same-file conflict and verify no silent overwrite
- restore checkpoint

Operational verification:

- migrate one existing project
- compare exported workspace files to Mongo docs/files
- compile before and after migration
- run agent edit and rollback

## Risks

- This is a project storage migration, not just an agent feature.
- Existing Overleaf internals may assume Mongo doc ids in many places.
- Browser collaboration may need a compatibility layer while persistence moves to files.
- Filesystem permissions and deployment volume layout become critical.
- Agent shell access can damage project files if path containment or checkpoints fail.

These risks are accepted for this route because the desired result is a clean Cline-native real workspace model.
