import { postJSON, getJSON } from '@/infrastructure/fetch-json'
import { FetchError } from '@/infrastructure/fetch-json'
import getMeta from '@/utils/meta'
import type { ProjectAiSelection } from '@/features/ai-assistant/api'

export type AiAgentTool = {
  name: string
  description: string
  access: 'read' | 'write' | string
  requiresApproval: boolean
}

export type AiAgentSkill = {
  id: string
  name: string
  displayName: string
  description: string
  modelInvocable: boolean
  requiredTools: string[]
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
}

export type ProjectAiAgentConfig = {
  permissionProfile: {
    id: string
    writeToolsRequireApproval: boolean
    externalToolsEnabled: boolean
  }
  tools: AiAgentTool[]
  skills: AiAgentSkill[]
  plugins: AiAgentPlugin[]
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

export type ProjectAiAgentPatchOperation =
  | ProjectAiAgentPatchReplaceTextOperation
  | ProjectAiAgentPatchCreateDocOperation

export type ProjectAiAgentPatch = {
  id: string
  sessionId: string
  projectId: string
  createdByUserId: string
  status: 'pending' | 'approved' | 'applied' | 'rejected' | 'conflicted'
  baseRevision: Record<string, unknown>
  operations: ProjectAiAgentPatchOperation[]
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  createdAt: string | null
  appliedAt: string | null
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

type ProjectAiAgentStreamEvent =
  | { type: 'event'; event: ProjectAiAgentEvent }
  | { type: 'done'; session: ProjectAiAgentSession; answer: string }
  | { type: 'error'; error: { code: string; message: string } }

export function getProjectAiAgentConfig(projectId: string) {
  return getJSON<ProjectAiAgentConfig>(`/project/${projectId}/ai/agent/config`)
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

export function applyProjectAiAgentPatch(projectId: string, patchId: string) {
  return postJSON<{ patch: ProjectAiAgentPatch }>(
    `/project/${projectId}/ai/agent/patches/${patchId}/apply`,
    { body: {} }
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
