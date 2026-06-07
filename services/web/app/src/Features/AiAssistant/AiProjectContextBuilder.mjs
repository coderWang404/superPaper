import path from 'node:path'
import ProjectEntityHandler from '../Project/ProjectEntityHandler.mjs'

const DEFAULT_MAX_CHARS = 64_000
const INCLUDED_EXTENSIONS = new Set(['.tex', '.bib', '.cls', '.sty'])
const EXTENSION_PRIORITY = new Map([
  ['.tex', 0],
  ['.bib', 1],
  ['.cls', 2],
  ['.sty', 3],
])

function isSupportedDoc(docPath) {
  return INCLUDED_EXTENSIONS.has(path.extname(docPath).toLowerCase())
}

function getDocText(doc) {
  return Array.isArray(doc.lines) ? doc.lines.join('\n') : ''
}

function formatContextBlock(label, content) {
  return `### ${label}\n${content}`
}

function addBudgetedMessage(messages, content, state) {
  if (state.remaining <= 0) {
    state.truncated = true
    return false
  }
  if (content.length > state.remaining) {
    messages.push({
      role: 'user',
      content: content.slice(0, state.remaining),
    })
    state.remaining = 0
    state.truncated = true
    return false
  }
  messages.push({ role: 'user', content })
  state.remaining -= content.length
  return true
}

function sortDocPaths(paths) {
  return [...paths].sort((left, right) => {
    if (left === '/main.tex') return -1
    if (right === '/main.tex') return 1
    const leftExt = path.extname(left).toLowerCase()
    const rightExt = path.extname(right).toLowerCase()
    const leftPriority = EXTENSION_PRIORITY.get(leftExt) ?? 99
    const rightPriority = EXTENSION_PRIORITY.get(rightExt) ?? 99
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }
    return left.localeCompare(right)
  })
}

export async function buildProjectContext(projectId, options = {}) {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const messages = []
  const includedFiles = []
  const state = { remaining: maxChars, truncated: false }
  let selectionIncluded = false

  const selectionText = options.selection?.text?.trim()
  if (selectionText) {
    const previousMessageCount = messages.length
    addBudgetedMessage(
      messages,
      formatContextBlock(
        `Selected text${options.selection.path ? ` from ${options.selection.path}` : ''}`,
        selectionText
      ),
      state
    )
    selectionIncluded = messages.length > previousMessageCount
  }

  for (const docPath of sortDocPaths(Object.keys(docs))) {
    if (!isSupportedDoc(docPath)) {
      continue
    }
    const text = getDocText(docs[docPath])
    if (!text) {
      continue
    }
    const addedAll = addBudgetedMessage(
      messages,
      formatContextBlock(`Project file ${docPath}`, text),
      state
    )
    if (messages.at(-1)?.content.includes(`Project file ${docPath}`)) {
      includedFiles.push(docPath)
    }
    if (!addedAll) {
      break
    }
  }

  return {
    messages,
    includedFiles,
    selectionIncluded,
    truncated: state.truncated,
  }
}
