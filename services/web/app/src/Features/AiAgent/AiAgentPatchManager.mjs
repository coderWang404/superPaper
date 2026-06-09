import crypto from 'node:crypto'
import path from 'node:path'
import { AgentEvent } from '../../models/AgentEvent.mjs'
import { AgentPatch } from '../../models/AgentPatch.mjs'
import { AgentSession } from '../../models/AgentSession.mjs'
import CompileManager from '../Compile/CompileManager.mjs'
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
      operation.type === 'replace_text' ||
      operation.type === 'delete_doc' ||
      operation.type === 'rename_entity' ||
      operation.type === 'move_entity'
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
    riskLevel: riskLevelForOperations(normalizedOperations),
  })
  patch.operations = materializePatchOperations(patch)
  await patch.save()

  return publicPatch(patch)
}

export async function applyPatch({
  projectId,
  userId,
  patchId,
  hunkIds = null,
  rejectUnselected = false,
}) {
  const patch = await AgentPatch.findOne({
    _id: patchId,
    projectId,
  }).exec()

  if (!patch) {
    throw new AiAgentPatchError('AGENT_PATCH_NOT_FOUND', 'Agent patch not found')
  }
  if (
    patch.status !== 'pending' &&
    patch.status !== 'approved' &&
    patch.status !== 'partially_applied'
  ) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_NOT_PENDING',
      'Agent patch is not pending approval'
    )
  }
  const selectedHunkIds = selectedHunkSetOrNull(hunkIds)
  patch.operations = materializePatchOperations(patch)
  assertRequestedHunksExist(patch, selectedHunkIds)
  const operationSelections = applySelectionsForPatch({
    patch,
    selectedHunkIds,
    rejectUnselected,
  })

  const [docs, files] = await Promise.all([
    ProjectEntityHandler.promises.getAllDocs(projectId),
    ProjectEntityHandler.promises.getAllFiles(projectId),
  ])
  const applyPlan = await assertApplySelectionsSafe({
    patch,
    selections: operationSelections.toApply,
    docs,
    files,
  })
  const appliedOperations = []
  const rollbackOperations = []

  for (const { operation, hunk } of operationSelections.toApply) {
    if (operation.type === 'replace_text') {
      await applyReplaceTextOperation({
        operation,
        hunk,
        projectId,
        userId,
        patch,
        docs,
        textPlan: applyPlan.textPlans.get(hunk.id),
        appliedOperations,
        rollbackOperations,
      })
    } else if (operation.type === 'create_doc') {
      await applyCreateDocOperation({
        operation,
        hunk,
        projectId,
        userId,
        patch,
        docs,
        files,
        appliedOperations,
        rollbackOperations,
      })
    } else if (operation.type === 'delete_doc') {
      await applyDeleteDocOperation({
        operation,
        hunk,
        projectId,
        userId,
        patch,
        docs,
        appliedOperations,
        rollbackOperations,
      })
    } else if (operation.type === 'rename_entity') {
      await applyRenameEntityOperation({
        operation,
        hunk,
        projectId,
        userId,
        patch,
        docs,
        files,
        appliedOperations,
        rollbackOperations,
      })
    } else if (operation.type === 'move_entity') {
      await applyMoveEntityOperation({
        operation,
        hunk,
        projectId,
        userId,
        patch,
        docs,
        files,
        appliedOperations,
        rollbackOperations,
      })
    } else {
      throw new AiAgentPatchError(
        'AGENT_PATCH_UNSUPPORTED_OPERATION',
        'Agent patch operation is not supported'
      )
    }
  }

  markAppliedOperationSelections(operationSelections.toApply)
  markRejectedOperationSelections(operationSelections.toReject)
  patch.status = patchStatusFromOperations(patch.operations)
  patch.approvedByUserId = userId
  if (operationSelections.toApply.length > 0) {
    patch.appliedByUserId = userId
    patch.appliedAt = new Date()
  }
  patch.approvedAt = patch.approvedAt || new Date()
  patch.appliedOperations = [
    ...(patch.appliedOperations || []),
    ...appliedOperations,
  ]
  patch.rollbackOperations = [
    ...(patch.rollbackOperations || []),
    ...rollbackOperations,
  ]
  await patch.save()
  const publicAppliedPatch = publicPatch(patch)

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
      ...(selectedHunkIds
        ? { hunkIds: operationSelections.toApply.map(({ hunk }) => hunk.id) }
        : {}),
    },
  })
  publicAppliedPatch.compileResult = await compileAfterPatch({
    sessionId: patch.sessionId,
    projectId,
    userId,
    patchId: patch._id?.toString?.() || patch.id,
  })
  if (!hasPendingHunks(patch.operations)) {
    await AgentSession.updateOne(
      { _id: patch.sessionId, projectId },
      { $set: { status: 'completed', completedAt: new Date() } }
    ).exec()
  }

  return publicAppliedPatch
}

export async function rollbackPatch({
  projectId,
  userId,
  patchId,
  hunkIds = null,
}) {
  const patch = await AgentPatch.findOne({
    _id: patchId,
    projectId,
  }).exec()

  if (!patch) {
    throw new AiAgentPatchError('AGENT_PATCH_NOT_FOUND', 'Agent patch not found')
  }
  const selectedHunkIds = selectedHunkSetOrNull(hunkIds)
  if (
    !selectedHunkIds &&
    patch.status !== 'applied' &&
    patch.status !== 'partially_applied'
  ) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_NOT_APPLIED',
      'Only applied agent patches can be rolled back'
    )
  }

  patch.operations = materializePatchOperations(patch)
  assertRequestedHunksExist(patch, selectedHunkIds)
  const rollbackOperations = patch.rollbackOperations || []
  const rollbackSelections = rollbackSelectionsForPatch({
    patch,
    rollbackOperations,
    selectedHunkIds,
  })
  if (!rollbackSelections.operations.length) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_ROLLBACK_UNAVAILABLE',
      'Agent patch does not have a rollback snapshot'
    )
  }

  const reversedOperations = [...rollbackSelections.operations].reverse()
  await assertRollbackOperationsSafe({ projectId, operations: reversedOperations })

  for (const operation of reversedOperations) {
    await applyRollbackOperation({ projectId, userId, operation })
  }

  markRolledBackOperationSelections(rollbackSelections.selections)
  patch.status = patchStatusFromOperations(patch.operations)
  patch.rolledBackByUserId = userId
  patch.rolledBackAt = new Date()
  await patch.save()

  await recordPatchEvent({
    sessionId: patch.sessionId,
    projectId,
    userId,
    type: 'patch_rolled_back',
    payload: {
      patchId: patch._id?.toString?.() || patch.id,
      operations: rollbackSelections.operations.map(publicRollbackOperation),
      ...(selectedHunkIds
        ? {
            hunkIds: rollbackSelections.selections.map(({ hunk }) => hunk.id),
          }
        : {}),
    },
  })

  const publicRolledBackPatch = publicPatch(patch)
  publicRolledBackPatch.compileResult = await compileAfterPatch({
    sessionId: patch.sessionId,
    projectId,
    userId,
    patchId: patch._id?.toString?.() || patch.id,
  })

  return publicRolledBackPatch
}

export async function rejectPatch({ projectId, userId, patchId, hunkIds = null }) {
  const patch = await AgentPatch.findOne({
    _id: patchId,
    projectId,
  }).exec()

  if (!patch) {
    throw new AiAgentPatchError('AGENT_PATCH_NOT_FOUND', 'Agent patch not found')
  }
  const selectedHunkIds = selectedHunkSetOrNull(hunkIds)
  if (
    patch.status !== 'pending' &&
    patch.status !== 'approved' &&
    patch.status !== 'partially_applied' &&
    !(selectedHunkIds && patch.status === 'applied')
  ) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_NOT_PENDING',
      'Agent patch is not pending approval'
    )
  }

  patch.operations = materializePatchOperations(patch)
  assertRequestedHunksExist(patch, selectedHunkIds)
  const operationSelections = rejectSelectionsForPatch({
    patch,
    selectedHunkIds,
  })
  markRejectedOperationSelections(operationSelections.toReject)

  patch.status =
    selectedHunkIds || (patch.operations || []).length > 0
      ? patchStatusFromOperations(patch.operations)
      : 'rejected'
  patch.rejectedByUserId = userId
  patch.rejectedAt = new Date()
  await patch.save()

  await recordPatchEvent({
    sessionId: patch.sessionId,
    projectId,
    userId,
    type: 'approval_response',
    payload: {
      patchId: patch._id?.toString?.() || patch.id,
      status: 'rejected',
      ...(selectedHunkIds
        ? { hunkIds: operationSelections.toReject.map(({ hunk }) => hunk.id) }
        : {}),
    },
  })
  await recordPatchEvent({
    sessionId: patch.sessionId,
    projectId,
    userId,
    type: 'patch_rejected',
    payload: {
      patchId: patch._id?.toString?.() || patch.id,
      hunkIds: operationSelections.toReject.map(({ hunk }) => hunk.id),
    },
  })
  if (!hasPendingHunks(patch.operations)) {
    await AgentSession.updateOne(
      { _id: patch.sessionId, projectId },
      { $set: { status: 'completed', completedAt: new Date() } }
    ).exec()
  }

  return publicPatch(patch)
}

export function publicPatch(patch) {
  const operations = materializePatchOperations(patch)
  return {
    id: patch._id?.toString?.() || patch.id,
    sessionId: patch.sessionId?.toString?.() || patch.sessionId,
    projectId: patch.projectId?.toString?.() || patch.projectId,
    createdByUserId:
      patch.createdByUserId?.toString?.() || patch.createdByUserId,
    status: patch.status,
    baseRevision: patch.baseRevision || {},
    operations: operations.map(publicOperation),
    summary: patch.summary || '',
    riskLevel: patch.riskLevel || 'low',
    createdAt: patch.createdAt || null,
    appliedAt: patch.appliedAt || null,
    rolledBackAt: patch.rolledBackAt || null,
    rollbackAvailable:
      hasRollbackableHunks(operations, patch.rollbackOperations || []),
    compileResult: patch.compileResult || null,
  }
}

function normalizeOperation(operation, { docs, files }) {
  if (operation?.type === 'replace_text') {
    return normalizeReplaceTextOperation(operation, docs)
  }
  if (operation?.type === 'create_doc') {
    return normalizeCreateDocOperation(operation, { docs, files })
  }
  if (operation?.type === 'delete_doc') {
    return normalizeDeleteDocOperation(operation, docs)
  }
  if (operation?.type === 'rename_entity') {
    return normalizeRenameEntityOperation(operation, { docs, files })
  }
  if (operation?.type === 'move_entity') {
    return normalizeMoveEntityOperation(operation, { docs, files })
  }
  throw new AiAgentPatchError(
    'AGENT_PATCH_UNSUPPORTED_OPERATION',
    'Agent patch only supports replace_text, create_doc, delete_doc, rename_entity, and move_entity operations'
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

function normalizeDeleteDocOperation(operation, docs) {
  const projectPath = normalizeProjectPath(operation.path)
  assertSafePath(projectPath)

  const doc = docs[projectPath]
  if (!doc) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_FILE_NOT_FOUND',
      'Agent patch target document was not found'
    )
  }

  const content = getDocText(doc)
  return {
    type: 'delete_doc',
    path: projectPath,
    docId: doc._id?.toString?.() || doc._id,
    baseSha256: sha256(content),
    baseRev: doc.rev ?? null,
    diff: buildSimpleLineDiff({
      path: projectPath,
      before: content,
      after: '',
    }),
  }
}

function normalizeRenameEntityOperation(operation, { docs, files }) {
  const projectPath = normalizeProjectPath(operation.path)
  assertSafePath(projectPath)

  const doc = docs[projectPath]
  if (!doc) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_FILE_NOT_FOUND',
      'Agent patch target document was not found'
    )
  }

  const newName = normalizeEntityName(operation.newName)
  const newPath = path.posix.join(path.posix.dirname(projectPath), newName)
  assertSafePath(newPath)
  assertAllowedCreateDocExtension(newPath)
  if (newPath === projectPath) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_NOOP',
      'Agent patch rename does not change the path'
    )
  }
  if (docs[newPath] || files[newPath]) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_TARGET_EXISTS',
      'Agent patch target path already exists'
    )
  }

  const content = getDocText(doc)
  return {
    type: 'rename_entity',
    entityType: 'doc',
    path: projectPath,
    newName,
    newPath,
    docId: doc._id?.toString?.() || doc._id,
    baseSha256: sha256(content),
    baseRev: doc.rev ?? null,
    diff: buildSimpleLineDiff({
      path: projectPath,
      before: projectPath,
      after: newPath,
    }),
  }
}

function normalizeMoveEntityOperation(operation, { docs, files }) {
  const projectPath = normalizeProjectPath(operation.path)
  assertSafePath(projectPath)

  const doc = docs[projectPath]
  if (!doc) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_FILE_NOT_FOUND',
      'Agent patch target document was not found'
    )
  }

  const targetFolderPath = normalizeProjectPath(operation.targetFolderPath)
  assertSafePath(targetFolderPath)
  const newPath = path.posix.join(targetFolderPath, path.posix.basename(projectPath))
  if (newPath === projectPath) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_NOOP',
      'Agent patch move does not change the path'
    )
  }
  if (docs[newPath] || files[newPath]) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_TARGET_EXISTS',
      'Agent patch target path already exists'
    )
  }

  const content = getDocText(doc)
  return {
    type: 'move_entity',
    entityType: 'doc',
    path: projectPath,
    targetFolderPath,
    newPath,
    docId: doc._id?.toString?.() || doc._id,
    baseSha256: sha256(content),
    baseRev: doc.rev ?? null,
    diff: buildSimpleLineDiff({
      path: projectPath,
      before: projectPath,
      after: newPath,
    }),
  }
}

function publicOperation(operation) {
  return {
    id: operation.id,
    type: operation.type,
    status: operation.status || 'pending',
    entityType: operation.entityType,
    path: operation.path,
    newName: operation.newName,
    newPath: operation.newPath,
    targetFolderPath: operation.targetFolderPath,
    docId: operation.docId,
    oldText: operation.oldText,
    newText: operation.newText,
    content: operation.content,
    baseSha256: operation.baseSha256,
    proposedSha256: operation.proposedSha256,
    baseRev: operation.baseRev ?? null,
    diff: operation.diff,
    hunks: (operation.hunks || []).map(publicHunk),
  }
}

function publicHunk(hunk) {
  return {
    id: hunk.id,
    operationId: hunk.operationId,
    operationIndex: hunk.operationIndex,
    hunkIndex: hunk.hunkIndex,
    type: hunk.type,
    path: hunk.path,
    newPath: hunk.newPath,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    oldText: hunk.oldText || '',
    newText: hunk.newText || '',
    baseSha256: hunk.baseSha256,
    proposedSha256: hunk.proposedSha256,
    status: hunk.status || 'pending',
    appliedAt: hunk.appliedAt || null,
    rolledBackAt: hunk.rolledBackAt || null,
    conflict: hunk.conflict || null,
    diff: hunk.diff,
  }
}

function selectedHunkSetOrNull(hunkIds) {
  if (hunkIds == null) {
    return null
  }
  const unique = new Set(hunkIds)
  if (unique.size !== hunkIds.length) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_DUPLICATE_HUNK',
      'Agent patch hunk ids must be unique'
    )
  }
  return unique
}

function collectPatchHunks(patch) {
  return (patch.operations || []).flatMap(operation =>
    (operation.hunks || []).map(hunk => ({ operation, hunk }))
  )
}

function latestAppliedTextSnapshotForOperation(patch, operation) {
  const appliedHunkIds = new Set(
    (operation.hunks || [])
      .filter(hunk => hunk.status === 'applied')
      .map(hunk => hunk.id)
  )
  return [...(patch.rollbackOperations || [])]
    .reverse()
    .find(
      rollbackOperation =>
        rollbackOperation.operationId === operation.id &&
        rollbackOperation.type === 'restore_doc_text' &&
        appliedHunkIds.has(rollbackOperation.hunkId)
    )
}

function assertRequestedHunksExist(patch, selectedHunkIds) {
  if (!selectedHunkIds) {
    return
  }
  const existingHunkIds = new Set(
    collectPatchHunks(patch).map(({ hunk }) => hunk.id)
  )
  for (const hunkId of selectedHunkIds) {
    if (!existingHunkIds.has(hunkId)) {
      throw new AiAgentPatchError(
        'AGENT_PATCH_HUNK_NOT_FOUND',
        'Agent patch hunk was not found'
      )
    }
  }
}

function applySelectionsForPatch({
  patch,
  selectedHunkIds,
  rejectUnselected,
}) {
  const toApply = []
  const toReject = []
  for (const operation of patch.operations || []) {
    if (operation.type !== 'replace_text' && (operation.hunks || []).length > 1) {
      throw new AiAgentPatchError(
        'AGENT_PATCH_HUNK_UNSUPPORTED',
        'Agent patch operation has multiple hunks'
      )
    }
    for (const hunk of operation.hunks || []) {
      const isSelected = !selectedHunkIds || selectedHunkIds.has(hunk.id)
      if (selectedHunkIds && isSelected && hunk.status !== 'pending') {
        throw new AiAgentPatchError(
          'AGENT_PATCH_HUNK_NOT_PENDING',
          'Agent patch hunk is not pending approval'
        )
      }
      if (isSelected && hunk.status === 'pending') {
        toApply.push({ operation, hunk })
      } else if (selectedHunkIds && rejectUnselected && hunk.status === 'pending') {
        toReject.push({ operation, hunk })
      }
    }
  }
  if (selectedHunkIds && toApply.length === 0) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_HUNK_NOT_PENDING',
      'Agent patch hunk is not pending approval'
    )
  }
  return { toApply, toReject }
}

function rejectSelectionsForPatch({ patch, selectedHunkIds }) {
  const toReject = []
  for (const operation of patch.operations || []) {
    if (operation.type !== 'replace_text' && (operation.hunks || []).length > 1) {
      throw new AiAgentPatchError(
        'AGENT_PATCH_HUNK_UNSUPPORTED',
        'Agent patch operation has multiple hunks'
      )
    }
    for (const hunk of operation.hunks || []) {
      const isSelected = !selectedHunkIds || selectedHunkIds.has(hunk.id)
      if (selectedHunkIds && isSelected && hunk.status !== 'pending') {
        throw new AiAgentPatchError(
          'AGENT_PATCH_HUNK_NOT_PENDING',
          'Agent patch hunk is not pending approval'
        )
      }
      if (isSelected && hunk.status === 'pending') {
        toReject.push({ operation, hunk })
      }
    }
  }
  if (selectedHunkIds && toReject.length === 0) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_HUNK_NOT_PENDING',
      'Agent patch hunk is not pending approval'
    )
  }
  return { toReject }
}

function rollbackSelectionsForPatch({
  patch,
  rollbackOperations,
  selectedHunkIds,
}) {
  const hunkEntries = collectPatchHunks(patch)
  if (!selectedHunkIds) {
    return {
      operations: rollbackOperations,
      selections: hunkEntries.filter(({ hunk }) => hunk.status === 'applied'),
    }
  }

  const selectedEntries = hunkEntries.filter(({ hunk }) =>
    selectedHunkIds.has(hunk.id)
  )
  for (const { hunk } of selectedEntries) {
    if (hunk.status !== 'applied') {
      throw new AiAgentPatchError(
        'AGENT_PATCH_HUNK_NOT_APPLIED',
        'Agent patch hunk is not applied'
      )
    }
  }

  const rollbackHunkIds = new Set(
    rollbackOperations.map(operation => operation.hunkId).filter(Boolean)
  )
  for (const { hunk } of selectedEntries) {
    if (!rollbackHunkIds.has(hunk.id)) {
      throw new AiAgentPatchError(
        'AGENT_PATCH_ROLLBACK_UNAVAILABLE',
        'Agent patch hunk does not have a rollback snapshot'
      )
    }
  }
  assertNoAppliedHunkRollbackDependencies({
    selectedEntries,
    selectedHunkIds,
  })

  return {
    operations: rollbackOperations.filter(operation =>
      selectedHunkIds.has(operation.hunkId)
    ),
    selections: selectedEntries,
  }
}

function assertNoAppliedHunkRollbackDependencies({
  selectedEntries,
  selectedHunkIds,
}) {
  for (const { operation, hunk } of selectedEntries) {
    for (const candidate of operation.hunks || []) {
      if (
        candidate.operationId === hunk.operationId &&
        candidate.hunkIndex > hunk.hunkIndex &&
        candidate.status === 'applied' &&
        !selectedHunkIds.has(candidate.id)
      ) {
        throw new AiAgentPatchError(
          'AGENT_PATCH_HUNK_DEPENDENCY',
          'Agent patch hunk has later applied hunks'
        )
      }
    }
  }
}

function markAppliedOperationSelections(selections) {
  const appliedAt = new Date()
  for (const { operation, hunk } of selections) {
    hunk.status = 'applied'
    hunk.appliedAt = appliedAt
    operation.status = operationStatusFromHunks(operation)
  }
}

function markRejectedOperationSelections(selections) {
  for (const { operation, hunk } of selections) {
    hunk.status = 'rejected'
    operation.status = operationStatusFromHunks(operation)
  }
}

function markRolledBackOperationSelections(selections) {
  const rolledBackAt = new Date()
  for (const { operation, hunk } of selections) {
    hunk.status = 'rolled_back'
    hunk.rolledBackAt = rolledBackAt
    operation.status = operationStatusFromHunks(operation)
  }
}

function patchStatusFromOperations(operations) {
  const statuses = (operations || []).flatMap(operation =>
    (operation.hunks || []).map(hunk => hunk.status || operation.status)
  )
  if (statuses.length === 0 || statuses.every(status => status === 'pending')) {
    return 'pending'
  }
  if (statuses.every(status => status === 'rejected')) {
    return 'rejected'
  }
  if (statuses.every(status => status === 'rolled_back')) {
    return 'rolled_back'
  }
  if (statuses.some(status => status === 'conflicted')) {
    return 'conflicted'
  }
  if (
    statuses.some(status => status === 'applied') &&
    statuses.some(status => status !== 'applied')
  ) {
    return 'partially_applied'
  }
  if (statuses.some(status => status === 'applied')) {
    return 'applied'
  }
  if (statuses.some(status => status === 'pending')) {
    return 'pending'
  }
  if (statuses.some(status => status === 'rolled_back')) {
    return 'rolled_back'
  }
  return 'pending'
}

function operationStatusFromHunks(operation) {
  const statuses = (operation.hunks || []).map(hunk => hunk.status)
  if (statuses.length === 0 || statuses.every(status => status === 'pending')) {
    return 'pending'
  }
  if (statuses.every(status => status === 'applied')) {
    return 'applied'
  }
  if (statuses.every(status => status === 'rejected')) {
    return 'rejected'
  }
  if (statuses.some(status => status === 'conflicted')) {
    return 'conflicted'
  }
  if (
    statuses.some(status => status === 'applied') &&
    statuses.some(status => status !== 'applied')
  ) {
    return 'partially_applied'
  }
  if (statuses.some(status => status === 'applied')) {
    return 'applied'
  }
  if (statuses.some(status => status === 'pending')) {
    return 'pending'
  }
  if (statuses.some(status => status === 'rolled_back')) {
    return 'rolled_back'
  }
  return statuses[0] || 'pending'
}

function hasPendingHunks(operations) {
  return (operations || []).some(operation =>
    (operation.hunks || []).some(hunk => hunk.status === 'pending')
  )
}

function hasRollbackableHunks(operations, rollbackOperations) {
  if (!rollbackOperations.length) {
    return false
  }
  const rollbackHunkIds = new Set(
    rollbackOperations.map(operation => operation.hunkId).filter(Boolean)
  )
  return (operations || []).some(operation =>
    (operation.hunks || []).some(
      hunk =>
        hunk.status === 'applied' &&
        (rollbackHunkIds.size === 0 || rollbackHunkIds.has(hunk.id))
    )
  )
}

function materializePatchOperations(patch) {
  return (patch.operations || []).map((operation, operationIndex) => {
    const operationId = operation.id || operationIdForIndex(operationIndex)
    const operationStatus = operationStatusForPatch({
      patchStatus: patch.status,
      operationStatus: operation.status,
    })
    const operationWithId = {
      ...operation,
      id: operationId,
      status: operationStatus,
    }

    return {
      ...operationWithId,
      hunks: materializeOperationHunks({
        patch,
        operation: operationWithId,
        operationIndex,
      }),
    }
  })
}

function operationIdForIndex(index) {
  return `op-${String(index + 1).padStart(4, '0')}`
}

function materializeOperationHunks({ patch, operation, operationIndex }) {
  const existingHunks = Array.isArray(operation.hunks) ? operation.hunks : []
  if (existingHunks.length > 0) {
    return existingHunks.map((hunk, hunkIndex) =>
      materializeHunk({
        patch,
        operation,
        operationIndex,
        hunk,
        hunkIndex,
      })
    )
  }

  return [
    materializeHunk({
      patch,
      operation,
      operationIndex,
      hunk: hunkFromOperation(operation),
      hunkIndex: 0,
    }),
  ]
}

function materializeHunk({ patch, operation, operationIndex, hunk, hunkIndex }) {
  const operationId = operation.id || operationIdForIndex(operationIndex)
  const status = hunkStatusForPatch({
    patchStatus: patch.status,
    operationStatus: operation.status,
    hunkStatus: hunk.status,
  })
  const materialized = {
    ...hunk,
    operationId,
    operationIndex,
    hunkIndex,
    type: hunk.type || hunkTypeForOperation(operation),
    path: hunk.path || operation.path,
    newPath: hunk.newPath || operation.newPath,
    oldStart: hunk.oldStart ?? operation.diff?.oldStart ?? 1,
    oldLines: hunk.oldLines ?? operation.diff?.oldLines ?? 0,
    newStart: hunk.newStart ?? operation.diff?.newStart ?? 1,
    newLines: hunk.newLines ?? operation.diff?.newLines ?? 0,
    oldText: hunk.oldText ?? hunkTextBeforeOperation(operation),
    newText: hunk.newText ?? hunkTextAfterOperation(operation),
    baseSha256: hunk.baseSha256 || operation.baseSha256,
    proposedSha256: hunk.proposedSha256 || operation.proposedSha256,
    status,
    appliedAt: hunk.appliedAt || null,
    rolledBackAt: hunk.rolledBackAt || null,
    conflict: hunk.conflict || null,
    diff: hunk.diff || operation.diff,
  }
  return {
    ...materialized,
    id:
      materialized.id ||
      hunkIdFor({
        patch,
        operation,
        operationIndex,
        hunk: materialized,
        hunkIndex,
      }),
  }
}

function hunkFromOperation(operation) {
  return {
    type: hunkTypeForOperation(operation),
    path: operation.path,
    newPath: operation.newPath,
    oldStart: operation.diff?.oldStart ?? 1,
    oldLines: operation.diff?.oldLines ?? 0,
    newStart: operation.diff?.newStart ?? 1,
    newLines: operation.diff?.newLines ?? 0,
    oldText: hunkTextBeforeOperation(operation),
    newText: hunkTextAfterOperation(operation),
    baseSha256: operation.baseSha256,
    proposedSha256: operation.proposedSha256,
    diff: operation.diff,
  }
}

function hunkTypeForOperation(operation) {
  return operation.type === 'replace_text' ? 'text' : operation.type
}

function hunkTextBeforeOperation(operation) {
  if (operation.type === 'replace_text') {
    return operation.oldText || ''
  }
  if (operation.type === 'delete_doc') {
    return removedTextFromDiff(operation.diff)
  }
  if (
    operation.type === 'rename_entity' ||
    operation.type === 'move_entity'
  ) {
    return operation.path || ''
  }
  return ''
}

function hunkTextAfterOperation(operation) {
  if (operation.type === 'replace_text') {
    return operation.newText || ''
  }
  if (operation.type === 'create_doc') {
    return operation.content || ''
  }
  if (
    operation.type === 'rename_entity' ||
    operation.type === 'move_entity'
  ) {
    return operation.newPath || ''
  }
  return ''
}

function removedTextFromDiff(diff) {
  return (diff?.lines || [])
    .filter(line => line.type === 'remove')
    .map(line => line.content)
    .join('\n')
}

function operationStatusForPatch({ patchStatus, operationStatus }) {
  if (operationStatus) {
    return operationStatus
  }
  return isTerminalPatchStatus(patchStatus) ? patchStatus : 'pending'
}

function hunkStatusForPatch({ patchStatus, operationStatus, hunkStatus }) {
  if (hunkStatus) {
    return hunkStatus
  }
  if (operationStatus) {
    return operationStatus
  }
  return isTerminalPatchStatus(patchStatus) ? patchStatus : 'pending'
}

function isTerminalPatchStatus(status) {
  if (
    status === 'applied' ||
    status === 'rejected' ||
    status === 'conflicted' ||
    status === 'rolled_back'
  ) {
    return true
  }
  return false
}

function hunkIdFor({ patch, operation, operationIndex, hunk, hunkIndex }) {
  const operationId = operation.id || operationIdForIndex(operationIndex)
  const patchId = patch._id?.toString?.() || patch.id || 'new'
  const content = [
    patchId,
    operationId,
    operation.type,
    operation.path || '',
    operation.newPath || '',
    hunk.oldStart,
    hunk.oldLines,
    hunk.newStart,
    hunk.newLines,
    hunk.oldText || '',
    hunk.newText || '',
  ].join('\u001f')
  return `${operationId}:h-${String(hunkIndex + 1).padStart(4, '0')}:${sha256(
    content
  ).slice(0, 12)}`
}

function riskLevelForOperations(operations) {
  if (operations.some(operation => operation.type === 'delete_doc')) {
    return 'high'
  }
  if (
    operations.some(
      operation =>
        operation.type === 'rename_entity' || operation.type === 'move_entity'
    )
  ) {
    return 'medium'
  }
  return operations.length === 1 ? 'low' : 'medium'
}

async function assertApplySelectionsSafe({ patch, selections, docs, files }) {
  const textPlans = new Map()
  const textSelectionsByPath = new Map()

  for (const selection of selections) {
    const { operation } = selection
    if (operation.type === 'replace_text') {
      const key = operation.path
      if (!textSelectionsByPath.has(key)) {
        textSelectionsByPath.set(key, [])
      }
      textSelectionsByPath.get(key).push(selection)
    } else if (operation.type === 'create_doc') {
      await assertCreateDocOperationSafe({ operation, patch, docs, files })
    } else if (operation.type === 'delete_doc') {
      await assertExistingDocOperationSafe({ operation, patch, docs })
    } else if (
      operation.type === 'rename_entity' ||
      operation.type === 'move_entity'
    ) {
      await assertPathChangingOperationSafe({ operation, patch, docs, files })
    }
  }

  for (const textSelections of textSelectionsByPath.values()) {
    await planTextHunkApplications({
      patch,
      selections: textSelections,
      docs,
      textPlans,
    })
  }

  return { textPlans }
}

async function assertReplaceTextOperationSafe({ operation, patch, docs }) {
  const currentContent = await assertExistingDocOperationSafe({
    operation,
    patch,
    docs,
  })
  assertSingleOccurrence(currentContent, operation.oldText, operation.path)
}

async function planTextHunkApplications({
  patch,
  selections,
  docs,
  textPlans,
}) {
  const orderedSelections = [...selections].sort(compareOperationHunkOrder)
  const [firstSelection] = orderedSelections
  const { operation } = firstSelection
  const doc = docs[operation.path]
  if (!doc) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document no longer exists'
    )
  }
  const currentContent = getDocText(doc)
  const previousSnapshot = latestAppliedTextSnapshotForOperation(patch, operation)
  const expectedBaseSha256 = previousSnapshot?.afterSha256 || operation.baseSha256
  if (sha256(currentContent) !== expectedBaseSha256) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document changed'
    )
  }
  let workingContent = currentContent

  for (const { operation, hunk } of orderedSelections) {
    assertSingleOccurrence(workingContent, hunk.oldText, operation.path)
    const nextContent = workingContent.replace(hunk.oldText, hunk.newText)
    textPlans.set(hunk.id, {
      beforeText: workingContent,
      afterText: nextContent,
      beforeSha256: sha256(workingContent),
      afterSha256: sha256(nextContent),
    })
    workingContent = nextContent
  }
}

function compareOperationHunkOrder(
  { operation: operationA, hunk: hunkA },
  { operation: operationB, hunk: hunkB }
) {
  const operationOrder =
    (operationA.operationIndex ?? hunkA.operationIndex ?? 0) -
    (operationB.operationIndex ?? hunkB.operationIndex ?? 0)
  if (operationOrder !== 0) {
    return operationOrder
  }
  return (hunkA.hunkIndex ?? 0) - (hunkB.hunkIndex ?? 0)
}

async function assertCreateDocOperationSafe({ operation, patch, docs, files }) {
  if (docs[operation.path] || files[operation.path]) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target path already exists'
    )
  }
}

async function assertPathChangingOperationSafe({
  operation,
  patch,
  docs,
  files,
}) {
  await assertExistingDocOperationSafe({ operation, patch, docs })
  if (docs[operation.newPath] || files[operation.newPath]) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target path already exists'
    )
  }
}

async function assertExistingDocOperationSafe({ operation, patch, docs }) {
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
  return currentContent
}

async function applyReplaceTextOperation({
  operation,
  hunk,
  projectId,
  userId,
  patch,
  docs,
  textPlan,
  appliedOperations,
  rollbackOperations,
}) {
  const doc = docs[operation.path]
  if (!doc) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document no longer exists'
    )
  }

  const currentContent = textPlan?.beforeText ?? getDocText(doc)
  const expectedBeforeSha256 = textPlan?.beforeSha256 ?? operation.baseSha256
  if (sha256(currentContent) !== expectedBeforeSha256) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document changed'
    )
  }

  const oldText = hunk?.oldText ?? operation.oldText
  const newText = hunk?.newText ?? operation.newText
  assertSingleOccurrence(currentContent, oldText, operation.path)
  const nextContent = textPlan?.afterText ?? currentContent.replace(oldText, newText)
  const afterSha256 = textPlan?.afterSha256 ?? sha256(nextContent)

  await DocumentUpdaterHandler.promises.setDocument(
    projectId,
    operation.docId,
    userId,
    splitDocText(nextContent),
    'agent'
  )
  doc.lines = splitDocText(nextContent)
  appliedOperations.push({
    type: operation.type,
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    docId: operation.docId,
    baseSha256: expectedBeforeSha256,
    appliedSha256: afterSha256,
  })
  rollbackOperations.push({
    type: 'restore_doc_text',
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    docId: operation.docId,
    beforeText: currentContent,
    beforeSha256: expectedBeforeSha256,
    afterSha256,
  })
}

async function applyCreateDocOperation({
  operation,
  hunk,
  projectId,
  userId,
  patch,
  docs,
  files,
  appliedOperations,
  rollbackOperations,
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
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    docId: doc?._id?.toString?.() || doc?._id || null,
    appliedSha256: sha256(operation.content || ''),
  })
  rollbackOperations.push({
    type: 'delete_created_doc',
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    docId: doc?._id?.toString?.() || doc?._id || null,
    afterSha256: sha256(operation.content || ''),
  })
}

async function applyDeleteDocOperation({
  operation,
  hunk,
  projectId,
  userId,
  patch,
  docs,
  appliedOperations,
  rollbackOperations,
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

  await EditorController.promises.deleteEntity(
    projectId,
    operation.docId,
    'doc',
    'agent',
    userId
  )
  appliedOperations.push({
    type: operation.type,
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    docId: operation.docId,
    baseSha256: operation.baseSha256,
  })
  rollbackOperations.push({
    type: 'restore_deleted_doc',
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    docId: operation.docId,
    beforeText: currentContent,
    beforeSha256: operation.baseSha256,
  })
}

async function applyRenameEntityOperation({
  operation,
  hunk,
  projectId,
  userId,
  patch,
  docs,
  files,
  appliedOperations,
  rollbackOperations,
}) {
  const doc = docs[operation.path]
  if (!doc) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document no longer exists'
    )
  }
  if (docs[operation.newPath] || files[operation.newPath]) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target path already exists'
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

  await EditorController.promises.renameEntity(
    projectId,
    operation.docId,
    'doc',
    operation.newName,
    userId,
    'agent'
  )
  appliedOperations.push({
    type: operation.type,
    operationId: operation.id,
    hunkId: hunk?.id,
    entityType: 'doc',
    path: operation.path,
    newPath: operation.newPath,
    docId: operation.docId,
    baseSha256: operation.baseSha256,
  })
  rollbackOperations.push({
    type: 'rename_entity_back',
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    currentPath: operation.newPath,
    docId: operation.docId,
    beforeSha256: operation.baseSha256,
    oldName: path.posix.basename(operation.path),
  })
}

async function applyMoveEntityOperation({
  operation,
  hunk,
  projectId,
  userId,
  patch,
  docs,
  files,
  appliedOperations,
  rollbackOperations,
}) {
  const doc = docs[operation.path]
  if (!doc) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target document no longer exists'
    )
  }
  if (docs[operation.newPath] || files[operation.newPath]) {
    await markConflicted(patch)
    throw new AiAgentPatchError(
      'AGENT_PATCH_CONFLICT',
      'Agent patch target path already exists'
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

  const { lastFolder } = await EditorController.promises.mkdirp(
    projectId,
    operation.targetFolderPath,
    userId
  )
  await EditorController.promises.moveEntity(
    projectId,
    operation.docId,
    lastFolder._id,
    'doc',
    userId,
    'agent'
  )
  appliedOperations.push({
    type: operation.type,
    operationId: operation.id,
    hunkId: hunk?.id,
    entityType: 'doc',
    path: operation.path,
    newPath: operation.newPath,
    targetFolderPath: operation.targetFolderPath,
    docId: operation.docId,
    baseSha256: operation.baseSha256,
  })
  rollbackOperations.push({
    type: 'move_entity_back',
    operationId: operation.id,
    hunkId: hunk?.id,
    path: operation.path,
    currentPath: operation.newPath,
    docId: operation.docId,
    beforeSha256: operation.baseSha256,
    targetFolderPath: path.posix.dirname(operation.path),
  })
}

async function assertRollbackOperationsSafe({ projectId, operations }) {
  const [docs, files] = await getProjectEntities(projectId)
  for (const operation of operations) {
    assertRollbackOperationSafe(operation, { docs, files })
  }
}

function assertRollbackOperationSafe(operation, { docs, files }) {
  if (operation.type === 'restore_doc_text') {
    const doc = docs[operation.path]
    assertRollbackDoc(doc, operation.afterSha256)
    return
  }
  if (operation.type === 'delete_created_doc') {
    const doc = docs[operation.path]
    assertRollbackDoc(doc, operation.afterSha256)
    return
  }
  if (operation.type === 'restore_deleted_doc') {
    assertRollbackTargetEmpty(operation.path, { docs, files })
    return
  }
  if (operation.type === 'rename_entity_back') {
    const doc = docs[operation.currentPath]
    assertRollbackDoc(doc, operation.beforeSha256)
    assertRollbackTargetEmpty(operation.path, { docs, files })
    return
  }
  if (operation.type === 'move_entity_back') {
    const doc = docs[operation.currentPath]
    assertRollbackDoc(doc, operation.beforeSha256)
    assertRollbackTargetEmpty(operation.path, { docs, files })
    return
  }
  throw new AiAgentPatchError(
    'AGENT_PATCH_ROLLBACK_UNSUPPORTED_OPERATION',
    'Agent patch rollback operation is not supported'
  )
}

async function applyRollbackOperation({ projectId, userId, operation }) {
  if (operation.type === 'restore_doc_text') {
    await DocumentUpdaterHandler.promises.setDocument(
      projectId,
      operation.docId,
      userId,
      splitDocText(operation.beforeText || ''),
      'agent-rollback'
    )
    return
  }
  if (operation.type === 'delete_created_doc') {
    await EditorController.promises.deleteEntity(
      projectId,
      operation.docId,
      'doc',
      'agent-rollback',
      userId
    )
    return
  }
  if (operation.type === 'restore_deleted_doc') {
    await EditorController.promises.upsertDocWithPath(
      projectId,
      operation.path,
      splitDocText(operation.beforeText || ''),
      'agent-rollback',
      userId
    )
    return
  }
  if (operation.type === 'rename_entity_back') {
    await EditorController.promises.renameEntity(
      projectId,
      operation.docId,
      'doc',
      operation.oldName,
      userId,
      'agent-rollback'
    )
    return
  }
  if (operation.type === 'move_entity_back') {
    const { lastFolder, folder } = await EditorController.promises.mkdirp(
      projectId,
      operation.targetFolderPath,
      userId
    )
    const targetFolder = lastFolder || folder
    await EditorController.promises.moveEntity(
      projectId,
      operation.docId,
      targetFolder._id,
      'doc',
      userId,
      'agent-rollback'
    )
    return
  }
  throw new AiAgentPatchError(
    'AGENT_PATCH_ROLLBACK_UNSUPPORTED_OPERATION',
    'Agent patch rollback operation is not supported'
  )
}

function assertRollbackDoc(doc, expectedSha256) {
  if (!doc) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_ROLLBACK_CONFLICT',
      'Agent patch rollback target document was not found'
    )
  }
  if (expectedSha256 && sha256(getDocText(doc)) !== expectedSha256) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_ROLLBACK_CONFLICT',
      'Agent patch rollback target document changed'
    )
  }
}

function assertRollbackTargetEmpty(projectPath, { docs, files }) {
  if (docs[projectPath] || files[projectPath]) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_ROLLBACK_CONFLICT',
      'Agent patch rollback target path already exists'
    )
  }
}

function publicRollbackOperation(operation) {
  return {
    type: operation.type,
    path: operation.path,
    currentPath: operation.currentPath,
    docId: operation.docId,
  }
}

function getProjectEntities(projectId) {
  return Promise.all([
    ProjectEntityHandler.promises.getAllDocs(projectId),
    ProjectEntityHandler.promises.getAllFiles(projectId),
  ])
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

function normalizeEntityName(name) {
  if (typeof name !== 'string') {
    throw new AiAgentPatchError(
      'AGENT_PATCH_INVALID_PATH',
      'Agent patch path is invalid'
    )
  }
  const trimmedName = name.trim()
  if (
    !trimmedName ||
    trimmedName.includes('/') ||
    trimmedName.includes('\\') ||
    trimmedName === '.' ||
    trimmedName === '..'
  ) {
    throw new AiAgentPatchError(
      'AGENT_PATCH_INVALID_PATH',
      'Agent patch path is invalid'
    )
  }
  return trimmedName
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

async function compileAfterPatch({ sessionId, projectId, userId, patchId }) {
  await recordPatchEvent({
    sessionId,
    projectId,
    userId,
    type: 'compile_started',
    payload: { patchId },
  })

  let compileResult
  try {
    compileResult = publicCompileResult(
      await CompileManager.promises.compile(projectId, userId, {
        isAutoCompile: false,
        fileLineErrors: true,
        stopOnFirstError: false,
      })
    )
  } catch (err) {
    compileResult = {
      ok: false,
      status: 'failed',
      message: 'Compile request failed',
    }
  }

  await recordPatchEvent({
    sessionId,
    projectId,
    userId,
    type: 'compile_result',
    payload: {
      patchId,
      result: compileResult,
    },
  })
  return compileResult
}

function publicCompileResult(result) {
  return {
    ok: true,
    status: result.status || 'unknown',
    buildId: result.buildId || null,
    clsiServerId: result.clsiServerId || null,
    outputFiles: (result.outputFiles || [])
      .slice(0, 50)
      .map(file => ({
        path: file.path,
        type: file.type || null,
        size: typeof file.size === 'number' ? file.size : null,
      })),
    validationProblems: Array.isArray(result.validationProblems)
      ? result.validationProblems.slice(0, 25)
      : result.validationProblems || null,
    timings: result.timings || null,
  }
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
