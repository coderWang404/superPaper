import type {
  ProviderInput,
  ProviderListResponse,
  ProviderPatchInput,
  ProviderResponse,
  ProviderTestResponse,
  SafeApiError,
} from './types'

const SAFE_ERROR_MESSAGE = 'AI provider request failed'

export class AiProviderAdminRequestError extends Error {
  constructor(
    message: string,
    public safeError?: SafeApiError
  ) {
    super(message)
    this.name = 'AiProviderAdminRequestError'
  }
}

export async function listProviders(csrfToken: string) {
  return requestJSON<ProviderListResponse>('/admin/ai/providers', csrfToken)
}

export async function createProvider(
  csrfToken: string,
  input: ProviderInput
) {
  return requestJSON<ProviderResponse>('/admin/ai/providers', csrfToken, {
    method: 'POST',
    body: input,
  })
}

export async function updateProvider(
  csrfToken: string,
  providerId: string,
  input: ProviderPatchInput
) {
  return requestJSON<ProviderResponse>(
    `/admin/ai/providers/${encodeURIComponent(providerId)}`,
    csrfToken,
    {
      method: 'PATCH',
      body: input,
    }
  )
}

export async function deleteProvider(csrfToken: string, providerId: string) {
  return requestJSON<Record<string, never>>(
    `/admin/ai/providers/${encodeURIComponent(providerId)}`,
    csrfToken,
    { method: 'DELETE' }
  )
}

export async function syncModels(csrfToken: string, providerId: string) {
  return requestJSON<ProviderResponse>(
    `/admin/ai/providers/${encodeURIComponent(providerId)}/sync-models`,
    csrfToken,
    { method: 'POST' }
  )
}

export async function testProvider(csrfToken: string, providerId: string) {
  return requestJSON<ProviderTestResponse>(
    `/admin/ai/providers/${encodeURIComponent(providerId)}/test`,
    csrfToken,
    { method: 'POST' }
  )
}

async function requestJSON<T>(
  path: string,
  csrfToken: string,
  options: {
    method?: string
    body?: unknown
  } = {}
): Promise<T> {
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw await safeErrorFromResponse(response)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

async function safeErrorFromResponse(response: Response) {
  try {
    const safeError = safeErrorFromBody(await response.json())
    return new AiProviderAdminRequestError(
      safeMessageFromSafeError(safeError) || SAFE_ERROR_MESSAGE,
      safeError
    )
  } catch (error) {
    if (error instanceof AiProviderAdminRequestError) {
      return error
    }
    return new AiProviderAdminRequestError(SAFE_ERROR_MESSAGE)
  }
}

export function safeErrorFromBody(body: unknown): SafeApiError | undefined {
  if (!body || typeof body !== 'object') {
    return undefined
  }
  const candidate = 'error' in body ? body.error : body
  if (!candidate || typeof candidate !== 'object') {
    return undefined
  }

  const message =
    'message' in candidate && typeof candidate.message === 'string'
      ? candidate.message
      : ''
  const code =
    'code' in candidate && typeof candidate.code === 'string'
      ? candidate.code
      : undefined
  const fields =
    'fields' in candidate && Array.isArray(candidate.fields)
      ? candidate.fields
          .map(field => {
            if (
              !field ||
              typeof field !== 'object' ||
              !('field' in field) ||
              !('message' in field) ||
              typeof field.field !== 'string' ||
              typeof field.message !== 'string'
            ) {
              return null
            }
            return {
              field: field.field,
              message: field.message,
            }
          })
          .filter((field): field is { field: string; message: string } =>
            Boolean(field)
          )
      : undefined

  if (!message && !fields?.length) {
    return undefined
  }

  return { code, message, fields }
}

export function safeMessageFromSafeError(error?: SafeApiError) {
  if (!error) {
    return null
  }
  const fieldMessages = (error.fields || [])
    .map(field => field.message)
    .filter(Boolean)
  if (error.message && fieldMessages.length > 0) {
    return `${error.message}: ${fieldMessages.join('; ')}`
  }
  return error.message || fieldMessages.join('; ') || null
}

export function safeUserMessageFromError(error: unknown, fallback: string) {
  if (error instanceof AiProviderAdminRequestError && error.message) {
    return error.message
  }
  return fallback
}
