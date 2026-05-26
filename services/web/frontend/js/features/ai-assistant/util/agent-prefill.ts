import type { LogEntry as LogEntryData } from '@/features/pdf-preview/util/types'
import localStorage from '@/infrastructure/local-storage'

export const AI_ASSISTANT_PREFILL_EVENT = 'superpaper:ai-assistant-prefill'

export type AiAssistantPrefillMode = 'chat' | 'agent'

export type AiAssistantPrefill = {
  projectId: string
  mode: AiAssistantPrefillMode
  prompt: string
}

export function pendingAiAssistantPrefillKey(projectId: string) {
  return `superpaper.ai-assistant.${projectId}.pending-prefill`
}

export function publishAiAssistantPrefill(prefill: AiAssistantPrefill) {
  const normalized = normalizeAiAssistantPrefill(prefill, prefill.projectId)

  if (!normalized) {
    return
  }

  localStorage.setItem(pendingAiAssistantPrefillKey(normalized.projectId), normalized)
  window.dispatchEvent(
    new CustomEvent(AI_ASSISTANT_PREFILL_EVENT, { detail: normalized })
  )
}

export function consumePendingAiAssistantPrefill(projectId: string) {
  const key = pendingAiAssistantPrefillKey(projectId)
  const stored = localStorage.getItem(key)

  if (!stored) {
    return null
  }

  try {
    const parsed = normalizeAiAssistantPrefill(parseStoredPrefill(stored), projectId)
    localStorage.removeItem(key)
    return parsed
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

export function clearPendingAiAssistantPrefill(projectId: string) {
  localStorage.removeItem(pendingAiAssistantPrefillKey(projectId))
}

export function buildCompileErrorAgentPrompt(entry: LogEntryData) {
  const source = formatCompileErrorSource(entry)
  const message = entry.message || entry.raw || 'Unknown compiler error'
  const logExcerpt = entry.content || entry.raw

  return [
    'Fix this LaTeX compile error in the current project.',
    source ? `Source: ${source}` : '',
    `Error: ${message}`,
    logExcerpt && logExcerpt !== message ? `Log excerpt:\n${logExcerpt}` : '',
    'Plan the fix first. After the plan is ready, use Act mode to edit the real project files directly.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function normalizeAiAssistantPrefill(
  prefill: unknown,
  projectId: string
): AiAssistantPrefill | null {
  if (!prefill || typeof prefill !== 'object') {
    return null
  }

  const candidate = prefill as Partial<AiAssistantPrefill>
  if (
    candidate.projectId !== projectId ||
    (candidate.mode !== 'chat' && candidate.mode !== 'agent') ||
    typeof candidate.prompt !== 'string' ||
    !candidate.prompt.trim()
  ) {
    return null
  }

  return {
    projectId: candidate.projectId,
    mode: candidate.mode,
    prompt: candidate.prompt,
  }
}

function parseStoredPrefill(stored: unknown) {
  if (typeof stored !== 'string') {
    return stored
  }

  try {
    return JSON.parse(stored)
  } catch {
    return stored
  }
}

function formatCompileErrorSource(entry: LogEntryData) {
  if (!entry.file) {
    return ''
  }
  if (entry.line === null || entry.line === undefined || entry.line === '') {
    return entry.file
  }
  return `${entry.file}:${entry.line}`
}
