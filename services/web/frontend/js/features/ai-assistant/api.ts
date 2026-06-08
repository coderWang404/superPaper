import { getJSON, postJSON } from '@/infrastructure/fetch-json'
import { FetchError } from '@/infrastructure/fetch-json'
import getMeta from '@/utils/meta'

export type AiProviderModel = {
  id: string
  displayName: string
  enabled: boolean
}

export type ProjectAiProvider = {
  id: string
  name: string
  models: AiProviderModel[]
  defaultModel: string | null
}

export type ProjectAiConfig = {
  providers: ProjectAiProvider[]
}

export type ProjectAiSelection = {
  docId: string
  path: string
  text: string
}

export type ProjectAiChatRequest = {
  prompt: string
  providerId?: string
  model?: string
  selection?: ProjectAiSelection
  history?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

export type ProjectAiChatResponse = {
  answer: string
  providerId: string
  model: string
  context: {
    includedFiles: string[]
    selectionIncluded: boolean
    truncated: boolean
  }
}

export function getProjectAiConfig(projectId: string) {
  return getJSON<ProjectAiConfig>(`/project/${projectId}/ai/config`)
}

export function sendProjectAiChat(
  projectId: string,
  body: ProjectAiChatRequest
) {
  return postJSON<ProjectAiChatResponse>(`/project/${projectId}/ai/chat`, {
    body,
  })
}

type ProjectAiStreamEvent =
  | { type: 'delta'; delta: string }
  | {
      type: 'done'
      providerId: string
      model: string
      context: ProjectAiChatResponse['context']
    }
  | { type: 'error'; message: string }

export async function sendProjectAiChatStream(
  projectId: string,
  body: ProjectAiChatRequest,
  onDelta: (delta: string) => void
): Promise<ProjectAiChatResponse> {
  const path = `/project/${projectId}/ai/chat/stream`
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

  let answer = ''
  let doneEvent: Extract<ProjectAiStreamEvent, { type: 'done' }> | null = null

  for await (const event of readNDJSON<ProjectAiStreamEvent>(response)) {
    if (event.type === 'delta') {
      answer += event.delta
      onDelta(event.delta)
    } else if (event.type === 'done') {
      doneEvent = event
    } else if (event.type === 'error') {
      throw new Error(event.message)
    }
  }

  if (!doneEvent) {
    throw new Error('AI stream ended before completion')
  }

  return {
    answer,
    providerId: doneEvent.providerId,
    model: doneEvent.model,
    context: doneEvent.context,
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
      try {
        yield JSON.parse(line) as T
      } catch (e) {
        console.warn('AI stream: skipping malformed NDJSON line', line)
      }
    }
    newlineIndex = buffer.indexOf('\n')
  }
  setBuffer(buffer)
}

function* parseNDJSON<T>(text: string) {
  for (const line of text.split('\n')) {
    const trimmedLine = line.trim()
    if (trimmedLine) {
      try {
        yield JSON.parse(trimmedLine) as T
      } catch (e) {
        console.warn('AI stream: skipping malformed NDJSON line', trimmedLine)
      }
    }
  }
}
