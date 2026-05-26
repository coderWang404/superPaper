import { FetchError, getJSON, patchJSON, postJSON } from '@/infrastructure/fetch-json'
import getMeta from '@/utils/meta'
import type { ProjectAiSelection } from '@/features/ai-assistant/api'

export type AiAgentTool = {
  name: string
  description: string
  access: 'read' | 'write' | string
  requiresApproval: boolean
  category?: string
  riskLevel?: 'low' | 'medium' | 'high' | string
}

export type AiAgentSkill = {
  id: string
  name: string
  displayName: string
  description: string
  modelInvocable: boolean
  requiredTools: string[]
  keywords?: string[]
  content?: string
  enabled?: boolean
  scope?: string
  pluginId?: string | null
}

export type AiAgentPlugin = {
  id: string
  name: string
  version: string
  displayName?: string
  description: string
  enabled: boolean
  skills: string[]
  toolPresets: string[]
  scope?: string
}

export type AiAgentPluginSource =
  | {
      sourceType: 'local_directory'
      path: string
    }
  | {
      sourceType: 'zip_url'
      url: string
    }
  | {
      sourceType: 'github'
      url: string
      ref?: string
    }
  | {
      sourceType: 'uploaded_zip'
      uploadId: string
      originalName?: string
    }

export type AiAgentPluginPreviewSkill = {
  id: string
  displayName: string
  description: string
  requiredTools: string[]
  contentBytes: number
  sourcePath: string
}

export type AiAgentPluginPreview = {
  plugin: {
    id: string
    name: string
    version: string
    displayName: string
    description: string
    manifestFormat: string
  }
  source: {
    type: string
    url?: string
    archiveUrl?: string
    ref?: string | null
    uploadId?: string
    originalName?: string | null
    pathHash?: string
  }
  skills: AiAgentPluginPreviewSkill[]
  integrity: {
    sha256?: string
  }
  packageBytes: number
  fileCount: number
  warnings: string[]
}

export type AiAgentSkillImportSource =
  | {
      sourceType: 'github_file'
      url: string
    }
  | {
      sourceType: 'url'
      url: string
    }

export type AiAgentSkillImportPreview = {
  source: {
    type: string
    url: string
    rawUrl?: string
    ref?: string
    path?: string
  }
  content: string
  metadata: {
    name?: string
    description?: string
    displayName?: string
  }
  bytes: number
  sha256: string
}

export type AiAgentPluginInstallation = {
  pluginId: string
  name: string
  version: string
  displayName: string
  description: string
  enabled: boolean
  status: string
  manifestFormat: string
  source: {
    type: string
    url?: string
    archiveUrl?: string
    ref?: string | null
    uploadId?: string
    originalName?: string | null
    pathHash?: string
  }
  integrity: {
    sha256?: string
  }
  packageBytes: number
  fileCount: number
  skillIds: string[]
  warnings: string[]
}

export type AiAgentToolPolicy = {
  name: string
  access: 'read' | 'write' | string
  requiresApproval: boolean
  category?: string
  riskLevel?: 'low' | 'medium' | 'high' | string
  allowedModes: Array<'plan' | 'act' | string>
}

export type AiAgentInstructionProfile = {
  id: string
  scope: 'global' | 'project'
  projectId: string | null
  name: string
  enabled: boolean
  content?: string
  sha256?: string
  bytes?: number
  createdAt: string | null
  updatedAt: string | null
}

export type ProjectAiAgentConfig = {
  permissionProfile: {
    id: string
    writeToolsRequireApproval: boolean
    externalToolsEnabled: boolean
    actRequiredForWriteTools?: boolean
  }
  tools: AiAgentTool[]
  toolPolicies?: AiAgentToolPolicy[]
  skills: AiAgentSkill[]
  plugins: AiAgentPlugin[]
  enabledSkillIds?: string[]
  enabledPluginIds?: string[]
  instructionProfiles?: AiAgentInstructionProfile[]
}

export type ProjectAiAgentSession = {
  id: string
  projectId: string
  userId: string
  status: string
  mode: 'plan' | 'act'
  providerId: string | null
  model: string | null
  task: string
  instructionSources?: Array<{
    type: string
    path: string
    sha256: string
    bytes: number
  }>
  enabledSkillIds?: string[]
  enabledPluginIds?: string[]
  permissionProfileId: string
}

export type ProjectAiAgentEvent = {
  id: string
  sessionId: string
  sequence: number
  type: string
  payload: Record<string, unknown>
  createdAt: string | null
}

export type ProjectAiAgentPatchDiffLine = {
  type: 'context' | 'add' | 'remove'
  content: string
}

export type ProjectAiAgentPatchReplaceTextOperation = {
  type: 'replace_text'
  path: string
  docId: string
  oldText: string
  newText: string
  baseSha256: string
  proposedSha256: string
  baseRev: number | null
  diff: {
    path: string
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: ProjectAiAgentPatchDiffLine[]
  }
}

export type ProjectAiAgentPatchCreateDocOperation = {
  type: 'create_doc'
  path: string
  content: string
  proposedSha256: string
  diff: {
    path: string
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: ProjectAiAgentPatchDiffLine[]
  }
}

export type ProjectAiAgentPatchDeleteDocOperation = {
  type: 'delete_doc'
  path: string
  docId: string
  baseSha256: string
  baseRev: number | null
  diff: {
    path: string
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: ProjectAiAgentPatchDiffLine[]
  }
}

export type ProjectAiAgentPatchRenameEntityOperation = {
  type: 'rename_entity'
  entityType: 'doc'
  path: string
  newName: string
  newPath: string
  docId: string
  baseSha256: string
  baseRev: number | null
  diff: {
    path: string
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: ProjectAiAgentPatchDiffLine[]
  }
}

export type ProjectAiAgentPatchMoveEntityOperation = {
  type: 'move_entity'
  entityType: 'doc'
  path: string
  targetFolderPath: string
  newPath: string
  docId: string
  baseSha256: string
  baseRev: number | null
  diff: {
    path: string
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: ProjectAiAgentPatchDiffLine[]
  }
}

export type ProjectAiAgentPatchOperation =
  | ProjectAiAgentPatchReplaceTextOperation
  | ProjectAiAgentPatchCreateDocOperation
  | ProjectAiAgentPatchDeleteDocOperation
  | ProjectAiAgentPatchRenameEntityOperation
  | ProjectAiAgentPatchMoveEntityOperation

export type ProjectAiAgentPatch = {
  id: string
  sessionId: string
  projectId: string
  createdByUserId: string
  status:
    | 'pending'
    | 'approved'
    | 'applied'
    | 'rejected'
    | 'conflicted'
    | 'rolled_back'
  baseRevision: Record<string, unknown>
  operations: ProjectAiAgentPatchOperation[]
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  createdAt: string | null
  appliedAt: string | null
  rolledBackAt?: string | null
  rollbackAvailable?: boolean
  compileResult?: {
    ok: boolean
    status: string
    buildId?: string | null
    outputFiles?: Array<{ path: string; type: string | null; size: number | null }>
    validationProblems?: unknown
  } | null
}

export type CreateProjectAiAgentSessionRequest = {
  task: string
  providerId?: string
  model?: string
}

export type ProjectAiAgentTurnRequest = {
  prompt: string
  providerId?: string
  model?: string
  selection?: ProjectAiSelection
}

export type ProjectAiAgentTurnResponse = {
  session: ProjectAiAgentSession
  answer: string
}

export type ProjectAiAgentCheckpointRollbackResponse = {
  session: ProjectAiAgentSession
  restoredCommitHash: string
  changedPaths: string[]
  event: ProjectAiAgentEvent
}

type ProjectAiAgentStreamEvent =
  | { type: 'event'; event: ProjectAiAgentEvent }
  | { type: 'done'; session: ProjectAiAgentSession; answer: string }
  | { type: 'error'; error: { code: string; message: string } }

export function getProjectAiAgentConfig(projectId: string) {
  return getJSON<ProjectAiAgentConfig>(`/project/${projectId}/ai/agent/config`)
}

export function getEditableProjectAiAgentConfig(projectId: string) {
  return getJSON<ProjectAiAgentConfig>(
    `/project/${projectId}/ai/agent/config?includeContent=true`
  )
}

export function updateProjectAiAgentSettings(
  projectId: string,
  body: {
    skills?: AiAgentSkill[]
    plugins?: AiAgentPlugin[]
    instructionProfiles?: AiAgentInstructionProfile[]
  }
) {
  return fetchJSONPatch<ProjectAiAgentConfig>(
    `/project/${projectId}/ai/agent/settings?includeContent=true`,
    body
  )
}

export function listProjectAiAgentPlugins(projectId: string) {
  return getJSON<{ plugins: AiAgentPluginInstallation[] }>(
    `/project/${projectId}/ai/agent/plugins`
  )
}

export function previewProjectAiAgentPlugin(
  projectId: string,
  body: AiAgentPluginSource
) {
  return postJSON<{ preview: AiAgentPluginPreview }>(
    `/project/${projectId}/ai/agent/plugins/preview`,
    { body }
  )
}

export function previewProjectAiAgentSkillImport(
  projectId: string,
  body: AiAgentSkillImportSource
) {
  return postJSON<{ preview: AiAgentSkillImportPreview }>(
    `/project/${projectId}/ai/agent/skills/import-preview`,
    { body }
  )
}

export function installProjectAiAgentPlugin(
  projectId: string,
  body: AiAgentPluginSource & { enabled?: boolean }
) {
  return postJSON<{
    plugin: AiAgentPluginInstallation
    config: ProjectAiAgentConfig
  }>(`/project/${projectId}/ai/agent/plugins/install`, { body })
}

export function setProjectAiAgentPluginEnabled(
  projectId: string,
  pluginId: string,
  enabled: boolean
) {
  return fetchJSONPatch<{
    plugin: AiAgentPluginInstallation
    config: ProjectAiAgentConfig
  }>(`/project/${projectId}/ai/agent/plugins/${encodeURIComponent(pluginId)}`, {
    enabled,
  })
}

export async function uploadProjectAiAgentPluginZip(
  projectId: string,
  file: File
) {
  const formData = new FormData()
  formData.append('plugin', file, file.name)
  const path = `/project/${projectId}/ai/agent/plugins/upload`
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Csrf-Token': getMeta('ol-csrfToken'),
    },
    body: formData,
  })

  if (!response.ok) {
    throw new FetchError(response.statusText, path, undefined, response)
  }

  return response.json() as Promise<{
    uploadId: string
    originalName: string
    preview: AiAgentPluginPreview
  }>
}

export function createProjectAiAgentSession(
  projectId: string,
  body: CreateProjectAiAgentSessionRequest
) {
  return postJSON<{ session: ProjectAiAgentSession }>(
    `/project/${projectId}/ai/agent/sessions`,
    { body }
  )
}

function fetchJSONPatch<T>(path: string, body: Record<string, unknown>) {
  return patchJSON<T>(path, {
    body,
  })
}

export function startProjectAiAgentAct(projectId: string, sessionId: string) {
  return postJSON<{ session: ProjectAiAgentSession }>(
    `/project/${projectId}/ai/agent/sessions/${sessionId}/start-act`,
    { body: {} }
  )
}

export function applyProjectAiAgentPatch(projectId: string, patchId: string) {
  return postJSON<{ patch: ProjectAiAgentPatch }>(
    `/project/${projectId}/ai/agent/patches/${patchId}/apply`,
    { body: {} }
  )
}

export function rejectProjectAiAgentPatch(projectId: string, patchId: string) {
  return postJSON<{ patch: ProjectAiAgentPatch }>(
    `/project/${projectId}/ai/agent/patches/${patchId}/reject`,
    { body: {} }
  )
}

export function rollbackProjectAiAgentPatch(projectId: string, patchId: string) {
  return postJSON<{ patch: ProjectAiAgentPatch }>(
    `/project/${projectId}/ai/agent/patches/${patchId}/rollback`,
    { body: {} }
  )
}

export function rollbackProjectAiAgentSessionCheckpoint(
  projectId: string,
  sessionId: string,
  commitHash: string
) {
  return postJSON<ProjectAiAgentCheckpointRollbackResponse>(
    `/project/${projectId}/ai/agent/sessions/${sessionId}/rollback-checkpoint`,
    { body: { commitHash } }
  )
}

export async function sendProjectAiAgentTurnStream(
  projectId: string,
  sessionId: string,
  body: ProjectAiAgentTurnRequest,
  onEvent: (event: ProjectAiAgentEvent) => void
): Promise<ProjectAiAgentTurnResponse> {
  const path = `/project/${projectId}/ai/agent/sessions/${sessionId}/turns`
  const options: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json',
      'X-Csrf-Token': getMeta('ol-csrfToken'),
    },
    body: JSON.stringify(body),
  }
  const response = await fetch(path, options)

  if (!response.ok) {
    throw new FetchError(response.statusText, path, options, response)
  }

  let doneEvent: Extract<ProjectAiAgentStreamEvent, { type: 'done' }> | null =
    null

  for await (const event of readNDJSON<ProjectAiAgentStreamEvent>(response)) {
    if (event.type === 'event') {
      onEvent(event.event)
    } else if (event.type === 'done') {
      doneEvent = event
    } else if (event.type === 'error') {
      throw new Error(event.error.message)
    }
  }

  if (!doneEvent) {
    throw new Error('Agent stream ended before completion')
  }

  return {
    session: doneEvent.session,
    answer: doneEvent.answer,
  }
}

async function* readNDJSON<T>(response: Response): AsyncGenerator<T> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    yield* parseNDJSON<T>(await response.text())
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      yield* parseCompleteNDJSONLines<T>(buffer, nextBuffer => {
        buffer = nextBuffer
      })
    }
  } finally {
    reader.releaseLock()
  }

  buffer += decoder.decode(new Uint8Array())
  if (buffer.trim()) {
    yield* parseNDJSON<T>(buffer)
  }
}

function* parseCompleteNDJSONLines<T>(
  buffer: string,
  setBuffer: (buffer: string) => void
) {
  let newlineIndex = buffer.indexOf('\n')
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim()
    buffer = buffer.slice(newlineIndex + 1)
    if (line) {
      yield JSON.parse(line) as T
    }
    newlineIndex = buffer.indexOf('\n')
  }
  setBuffer(buffer)
}

function* parseNDJSON<T>(text: string) {
  for (const line of text.split('\n')) {
    const trimmedLine = line.trim()
    if (trimmedLine) {
      yield JSON.parse(trimmedLine) as T
    }
  }
}
