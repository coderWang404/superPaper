import logger from '@superpaper/logger'
import EditorRealTimeController from '../Editor/EditorRealTimeController.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'

const DEFAULT_INTERVAL_MS = 1500
const watchers = new Map()

async function start(projectId, options = {}) {
  const key = projectId.toString()
  if (watchers.has(key)) {
    return watchers.get(key)
  }

  const state = {
    projectId: key,
    intervalMs: options.intervalMs || DEFAULT_INTERVAL_MS,
    polling: false,
    snapshot: await takeSnapshot(key),
    timer: null,
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
  const key = projectId.toString()
  const state = watchers.get(key)
  if (state == null) {
    return
  }
  clearInterval(state.timer)
  watchers.delete(key)
}

async function poll(state) {
  if (state.polling) {
    return
  }
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
  const changedPaths = new Set()
  for (const [projectPath, signature] of next.entries()) {
    if (previous.get(projectPath) !== signature) {
      changedPaths.add(projectPath)
    }
  }
  for (const projectPath of previous.keys()) {
    if (!next.has(projectPath)) {
      changedPaths.add(projectPath)
    }
  }
  return Array.from(changedPaths).sort()
}

export default {
  start,
  stop,
  poll,
  takeSnapshot,
  diffSnapshots,
}
