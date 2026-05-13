import { getJSON, postJSON } from '@/infrastructure/fetch-json'

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
