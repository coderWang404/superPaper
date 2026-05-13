import { parseOpenAIModelsResponse } from './AiProviderValidation.mjs'

const DEFAULT_TIMEOUT_MS = 10_000

function buildModelsURL(baseURL) {
  return `${baseURL.replace(/\/+$/, '')}/models`
}

function buildChatCompletionsURL(baseURL) {
  return `${baseURL.replace(/\/+$/, '')}/chat/completions`
}

export class AiProviderError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'AiProviderError'
    this.status = options.status
  }
}

export async function syncOpenAICompatibleModels({
  baseURL,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(buildModelsURL(baseURL), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new AiProviderError(
        `AI provider model sync failed with status ${response.status}`,
        { status: response.status }
      )
    }

    return parseOpenAIModelsResponse(await response.json())
  } finally {
    clearTimeout(timeout)
  }
}

export async function createOpenAICompatibleChatCompletion({
  baseURL,
  apiKey,
  model,
  messages,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  temperature = 0.2,
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(buildChatCompletionsURL(baseURL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new AiProviderError(
        `AI provider chat completion failed with status ${response.status}`,
        { status: response.status }
      )
    }

    const body = await response.json()
    const answer = body?.choices?.[0]?.message?.content
    if (typeof answer !== 'string') {
      throw new AiProviderError('AI provider chat completion response is invalid')
    }
    return answer
  } finally {
    clearTimeout(timeout)
  }
}
