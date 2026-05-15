import { parseOpenAIModelsResponse } from './AiProviderValidation.mjs'

const DEFAULT_TIMEOUT_MS = 10_000

function buildModelsURL(baseURL) {
  return `${baseURL.replace(/\/+$/, '')}/models`
}

function buildChatCompletionsURL(baseURL) {
  return `${baseURL.replace(/\/+$/, '')}/chat/completions`
}

function isOfficialDeepSeekBaseURL(baseURL) {
  try {
    return new URL(baseURL).hostname === 'api.deepseek.com'
  } catch {
    return false
  }
}

function shouldUseDeepSeekV4Options({ baseURL, model }) {
  return (
    isOfficialDeepSeekBaseURL(baseURL) &&
    /^deepseek-v4-(?:pro|flash)$/.test(model)
  )
}

function buildChatCompletionBody({ baseURL, model, messages, temperature, stream }) {
  if (shouldUseDeepSeekV4Options({ baseURL, model })) {
    const body = {
      model,
      messages,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    }
    if (stream) {
      body.stream = true
    }
    return body
  }

  const body = { model, messages, temperature }
  if (stream) {
    body.stream = true
  }
  return body
}

export class AiProviderError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'AiProviderError'
    this.status = options.status
  }
}

function toProviderError(err, fallbackMessage) {
  if (err instanceof AiProviderError) {
    return err
  }
  return new AiProviderError(fallbackMessage, { cause: err })
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
  } catch (err) {
    throw toProviderError(err, 'AI provider model sync failed')
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
      body: JSON.stringify(
        buildChatCompletionBody({ baseURL, model, messages, temperature })
      ),
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
  } catch (err) {
    throw toProviderError(err, 'AI provider chat completion failed')
  } finally {
    clearTimeout(timeout)
  }
}

export async function* streamOpenAICompatibleChatCompletion({
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
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildChatCompletionBody({
          baseURL,
          model,
          messages,
          temperature,
          stream: true,
        })
      ),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new AiProviderError(
        `AI provider chat completion failed with status ${response.status}`,
        { status: response.status }
      )
    }
    if (!response.body) {
      throw new AiProviderError('AI provider chat completion stream is empty')
    }

    yield* parseOpenAICompatibleSSE(response.body)
  } catch (err) {
    throw toProviderError(err, 'AI provider chat completion failed')
  } finally {
    clearTimeout(timeout)
  }
}

async function* parseOpenAICompatibleSSE(body) {
  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of streamBodyChunks(body)) {
    buffer += decoder.decode(chunk, { stream: true })
    let newlineIndex = buffer.indexOf('\n')

    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')

      if (!line.startsWith('data:')) {
        continue
      }

      const data = line.slice('data:'.length).trim()
      if (!data || data === '[DONE]') {
        if (data === '[DONE]') {
          return
        }
        continue
      }

      const delta = parseOpenAICompatibleStreamDelta(data)
      if (delta) {
        yield delta
      }
    }
  }

  const tail = buffer.trim()
  if (tail.startsWith('data:')) {
    const data = tail.slice('data:'.length).trim()
    if (data && data !== '[DONE]') {
      const delta = parseOpenAICompatibleStreamDelta(data)
      if (delta) {
        yield delta
      }
    }
  }
}

async function* streamBodyChunks(body) {
  if (typeof body.getReader === 'function') {
    const reader = body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          return
        }
        if (value) {
          yield value
        }
      }
    } finally {
      reader.releaseLock()
    }
    return
  }

  yield* body
}

function parseOpenAICompatibleStreamDelta(data) {
  let event
  try {
    event = JSON.parse(data)
  } catch (err) {
    throw new AiProviderError('AI provider chat completion stream is invalid', {
      cause: err,
    })
  }

  const content = event?.choices?.[0]?.delta?.content
  return typeof content === 'string' ? content : ''
}
