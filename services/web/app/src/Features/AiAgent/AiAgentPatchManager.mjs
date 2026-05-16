import crypto from 'node:crypto'
import path from 'node:path'
import { AgentEvent } from '../../models/AgentEvent.mjs'
import { AgentPatch } from '../../models/AgentPatch.mjs'
import { AgentSession } from '../../models/AgentSession.mjs'
import DocumentUpdaterHandler from '../DocumentUpdater/DocumentUpdaterHandler.mjs'
import EditorController from '../Editor/EditorController.mjs'
import ProjectEntityHandler from '../Project/ProjectEntityHandler.mjs'

const MAX_OPERATIONS = 8
const MAX_TEXT_CHARS = 50_000
const DIFF_CONTEXT_LINES = 3
const ALLOWED_CREATE_DOC_EXTENSIONS = new Set([
  '.tex',
  '.bib',
  '.cls',
  '.sty',
  '.md',
  '.txt',
  '.ltx',
])
const SENSITIVE_PATH_PATTERNS = [
  /^\/?\.env(?:\.|$)/i,
  /^\/?secrets(?:\/|$)/i,
  /^\/?credentials\./i,
  /^\/?渠道\.txt$/i,
  /\.pem$/i,
  /\.key$/i,
]

export class AiAgentPatchError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AiAgentPatchError'
    this.code = code
  }
}

export async function createPatch({
  projectId,
  userId,
  sessionId,
  summary = '',
  operations,
}) {
  if (!sessionId) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_SESSION_REQUIRED',
      'Agent patch requires a session'
    )
  }
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_EMPTY',
      'Agent patch must include at least one operation'
    )
  }
  if (operations.length > MAX_OPERATIONS) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_TOO_LARGE',
      'Agent patch includes too many operations'
    )
  }

  const [docs, files] = await Promise.all([
    ProjectEntityHandler.promises.getAllDocs(projectId),
    ProjectEntityHandler.promises.getAllFiles(projectId),
  ])
  assertUniqueOperationPaths(operations)
  const normalizedOperations = operations.map(operation =>
    normalizeOperation(operation, { docs, files })
  )

  const baseRevision = {}
  for (const operation of normalizedOperations) {
    baseRevision[operation.path] =
      operation.type === 'replace_text'
        ? {
            docId: operation.docId,
            sha256: operation.baseSha256,
            rev: operation.baseRev,
          }
        : {
            docId: null,
            sha256: null,
            exists: false,
          }
  }

  const patch = await AgentPatch.create({
    sessionId,
    projectId,
    createdByUserId: userId,
    status: 'pending',
    baseRevision,
    operations: normalizedOperations,
    summary: String(summary || '').slice(0, 1000),
    riskLevel: normalizedOperations.length === 1 ? 'low' : 'medium',
  })

  return publicPatch(patch)
}

export async function applyPatch({ projectId, userId, patchId }) {
  const patch = await AgentPatch.findOne({
    _id: patchId,
    projectId,
  }).exec()

  if (!patch) {
    throw new AiAgentPatchError('AGENT_PATCH_NOT_FOUND', 'Agent patch not found')
  }
  if (patch.status !== 'pending' && patch.status !== 'approved') {
    throw new AiAgentPatchError(
      'AGENT_PATCH_NOT_PENDING',
      'Agent patch is not pending approval'
    )
  }

  const [docs, files] = await Promise.all([
    ProjectEntityHandler.promises.getAllDocs(projectId),
    ProjectEntityHandler.promises.getAllFiles(projectId),
  ])
  const appliedOperations = []

  for (const operation of patch.operations || []) {
    if (operation.type === 'replace_text') {
      await applyReplaceTextOperation({
        operation,
        projectId,
        userId,
        patch,
        docs,
        appliedOperations,
      })
    } else if (operation.type === 'create_doc') {
      await applyCreateDocOperation({
        operation,
        projectId,
        userId,
        patch,
        docs,
        files,
        appliedOperations,
      })
    } else {
      throw new AiAgentPatchError(
        'AGENT_PATCH_UNSUPPORTED_OPERATION',
        'Agent patch operation is not supported'
      )
    }
  }

  patch.status = 'applied'
  patch.approvedByUserId = userId
  patch.appliedByUserId = userId
  patch.approvedAt = patch.approvedAt || new Date()
  patch.appliedAt = new Date()
  await patch.save()

  await recordPatchEvent({
    sessionId: patch.sessionId,
    projectId,
    userId,
    type: 'approval_response',
    payload: {
      patchId: patch._id?.toString?.() || patch.id,
      status: 'approved',
    },
  })
  await recordPatchEvent({
    sessionId: patch.sessionId,
    projectId,
    userId,
    type: 'patch_applied',
    payload: {
      patchId: patch._id?.toString?.() || patch.id,
      operations: appliedOperations,
    },
  })
  await AgentSession.updateOne(
    { _id: patch.sessionId, projectId },
    { $set: { status: 'completed', completedAt: new Date() } }
  ).exec()

  return publicPatch(patch)
}

export function publicPatch(patch) {
  return {
    id: patch._id?.toString?.() || patch.id,
    sessionId: patch.sessionId?.toString?.() || patch.sessionId,
    projectId: patch.projectId?.toString?.() || patch.projectId,
    createdByUserId:
      patch.createdByUserId?.toString?.() || patch.createdByUserId,
    status: patch.status,
    baseRevision: patch.baseRevision || {},
    operations: (patch.operations || []).map(publicOperation),
    summary: patch.summary || '',
    riskLevel: patch.riskLevel || 'low',
    createdAt: patch.createdAt || null,
    appliedAt: patch.appliedAt || null,
  }
}

function normalizeOperation(operation, { docs, files }) {
  if (operation?.type === 'replace_text') {
    return normalizeReplaceTextOperation(operation, docs)
  }
  if (operation?.type === 'create_doc') {
    return normalizeCreateDocOperation(operation, { docs, files })
  }
  throw new AiAgentPatchError(
    'AGENT_PATCH_UNSUPPORTED_OPERATION',
    'Agent patch only supports replace_text and create_doc operations'
  )
}

function normalizeReplaceTextOperation(operation, docs) {
  const projectPath = normalizeProjectPath(operation.path)
  assertSafePath(projectPath)

  const oldText = assertPatchText(operation.oldText, 'oldText')
  const newText = assertPatchText(operation.newText, 'newText', {
    allowEmpty: true,
  })
  const doc = docs[projectPath]
  if (!doc) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_FILE_NOT_FOUND',
      'Agent patch target document was not found'
    )
  }

  const content = getDocText(doc)
  assertSingleOccurrence(content, oldText, projectPath)
  const nextContent = content.replace(oldText, newText)

  return {
    type: 'replace_text',
    path: projectPath,
    docId: doc._id?.toString?.() || doc._id,
    oldText,
    newText,
    baseSha256: sha256(content),
    proposedSha256: sha256(nextContent),
    baseRev: doc.rev ?? null,
    diff: buildSimpleLineDiff({
      path: projectPath,
      before: content,
      after: nextContent,
    }),
  }
}

function normalizeCreateDocOperation(operation, { docs, files }) {
  const projectPath = normalizeProjectPath(operation.path)
  assertSafePath(projectPath)
  assertAllowedCreateDocExtension(projectPath)

  if (docs[projectPath] || files[projectPath]) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_TARGET_EXISTS',
      'Agent patch target path already exists'
    )
  }

  const content = assertPatchText(operation.content || '', 'content', {
    allowEmpty: true,
  })

  return {
    type: 'create_doc',
    path: projectPath,
    content,
    proposedSha256: sha256(content),
    diff: buildSimpleLineDiff({
      path: projectPath,
      before: '',
      after: content,
    }),
  }
}

function publicOperation(operation) {
  return {
    type: operation.type,
    path: operation.path,
    docId: operation.docId,
    oldText: operation.oldText,
    newText: operation.newText,
    content: operation.content,
    baseSha256: operation.baseSha256,
    proposedSha256: operation.proposedSha256,
    baseRev: operation.baseRev ?? null,
    diff: operation.diff,
  }
}

async function applyReplaceTextOperation({
  operation,
  projectId,
  userId,
  patch,
  docs,
  appliedOperations,
}) {
  const doc = docs[operation.path]
  if (!doc) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document no longer exists'
    )
  }

  const currentContent = getDocText(doc)
  if (sha256(currentContent) !== operation.baseSha256) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document changed'
    )
  }

  assertSingleOccurrence(currentContent, operation.oldText, operation.path)
  const nextContent = currentContent.replace(
    operation.oldText,
    operation.newText
  )

  await DocumentUpdaterHandler.promises.setDocument(
    projectId,
    operation.docId,
    userId,
    splitDocText(nextContent),
    'agent'
  )
  appliedOperations.push({
    type: operation.type,
    path: operation.path,
    docId: operation.docId,
    baseSha256: operation.baseSha256,
    appliedSha256: sha256(nextContent),
  })
}

async function applyCreateDocOperation({
  operation,
  projectId,
  userId,
  patch,
  docs,
  files,
  appliedOperations,
}) {
  if (docs[operation.path] || files[operation.path]) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target path already exists'
    )
  }

  const { doc } = await EditorController.promises.upsertDocWithPath(
    projectId,
    operation.path,
    splitDocText(operation.content || ''),
    'agent',
    userId
  )
  appliedOperations.push({
    type: operation.type,
    path: operation.path,
    docId: doc?._id?.toString?.() || doc?._id || null,
    appliedSha256: sha256(operation.content || ''),
  })
}

function assertUniqueOperationPaths(operations) {
  const paths = new Set()
  for (const operation of operations) {
    if (typeof operation?.path !== 'string') {
      continue
    }
    const projectPath = normalizeProjectPath(operation.path)
    if (paths.has(projectPath)) {
      throw new AiAgentPatchError(
        'AGENT_PATCH_DUPLICATE_PATH',
        'Agent patch includes duplicate paths'
      )
    }
    paths.add(projectPath)
  }
}

function assertAllowedCreateDocExtension(projectPath) {
  const extension = path.posix.extname(projectPath).toLowerCase()
  if (!ALLOWED_CREATE_DOC_EXTENSIONS.has(extension)) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_UNSUPPORTED_FILE_TYPE',
      'Agent patch can only create text documents'
    )
  }
}

function normalizeProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_INVALID_PATH',
      'Agent patch path is invalid'
    )
  }
  const normalized = path.posix.normalize(`/${projectPath}`.replaceAll('\\', '/'))
  if (normalized.includes('..')) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_INVALID_PATH',
      'Agent patch path is invalid'
    )
  }
  return normalized
}

function assertSafePath(projectPath) {
  if (SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(projectPath))) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_SENSITIVE_PATH',
      'Sensitive path is blocked'
    )
  }
}

function assertPatchText(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new AiAgentPatchError(
      'AGENT_PATCH_INVALID_TEXT',
      `Agent patch ${field} is invalid`
    )
  }
  if (!allowEmpty && value.length === 0) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_INVALID_TEXT',
      `Agent patch ${field} is empty`
    )
  }
  if (value.length > MAX_TEXT_CHARS) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_TEXT_TOO_LARGE',
      `Agent patch ${field} is too large`
    )
  }
  return value
}

function assertSingleOccurrence(content, oldText, projectPath) {
  const firstIndex = content.indexOf(oldText)
  if (firstIndex === -1) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_OLD_TEXT_NOT_FOUND',
      `Agent patch old text was not found in ${projectPath}`
    )
  }
  if (content.indexOf(oldText, firstIndex + oldText.length) !== -1) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_OLD_TEXT_AMBIGUOUS',
      `Agent patch old text is ambiguous in ${projectPath}`
    )
  }
}

async function markConflicted(patch) {
  patch.status = 'conflicted'
  await patch.save()
}

async function recordPatchEvent({ sessionId, projectId, userId, type, payload }) {
  const countResult = AgentEvent.countDocuments?.({ sessionId })
  const sequence =
    typeof countResult?.exec === 'function' ? (await countResult.exec()) + 1 : 1
  await AgentEvent.create({
    sessionId,
    projectId,
    userId,
    sequence,
    type,
    payload,
    redactionVersion: 1,
  })
}

function buildSimpleLineDiff({ path: projectPath, before, after }) {
  const beforeLines = before.length ? before.split('\n') : []
  const afterLines = after.length ? after.split('\n') : []
  let prefix = 0
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] ===
      afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const contextStart = Math.max(0, prefix - DIFF_CONTEXT_LINES)
  const beforeEnd = beforeLines.length - suffix
  const afterEnd = afterLines.length - suffix
  const contextEndBefore = Math.min(beforeLines.length, beforeEnd + DIFF_CONTEXT_LINES)
  const contextEndAfter = Math.min(afterLines.length, afterEnd + DIFF_CONTEXT_LINES)
  const lines = []

  for (let index = contextStart; index < prefix; index += 1) {
    lines.push({ type: 'context', content: beforeLines[index] })
  }
  for (let index = prefix; index < beforeEnd; index += 1) {
    lines.push({ type: 'remove', content: beforeLines[index] })
  }
  for (let index = prefix; index < afterEnd; index += 1) {
    lines.push({ type: 'add', content: afterLines[index] })
  }
  for (let index = beforeEnd; index < contextEndBefore; index += 1) {
    lines.push({ type: 'context', content: beforeLines[index] })
  }

  return {
    path: projectPath,
    oldStart: contextStart + 1,
    oldLines: Math.max(contextEndBefore - contextStart, 0),
    newStart: contextStart + 1,
    newLines: Math.max(contextEndAfter - contextStart, 0),
    lines,
  }
}

function getDocText(doc) {
  return Array.isArray(doc.lines) ? doc.lines.join('\n') : ''
}

function splitDocText(content) {
  return content.split('\n')
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}
