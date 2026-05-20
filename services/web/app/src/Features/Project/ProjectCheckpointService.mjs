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
