import { ZodError } from 'zod'
import { AiProviderError } from './AiProviderClient.mjs'
import { AiProviderValidationError } from './AiProviderValidation.mjs'
import {
  createProvider,
  deleteProvider,
  listProviders,
  syncModels,
  testProvider,
  updateProvider,
} from './AiProviderManager.mjs'

const PROVIDER_SECRET_FIELDS = new Set(['apiKey', 'encryptedApiKey'])

function validationFieldsFromIssues(issues = []) {
  return issues
    .map(issue => {
      const field = issue.path?.join('.')
      if (!field || !issue.message) {
        return null
      }
      return {
        field,
        message: issue.message,
      }
    })
    .filter(Boolean)
}

function sanitizeValidationField(field) {
  if (!field || typeof field !== 'object') {
    return null
  }
  const fieldName =
    typeof field.field === 'string' ? field.field : String(field.field ?? '')
  if (!fieldName) {
    return null
  }
  const message =
    typeof field.message === 'string' && field.message
      ? field.message
      : 'Invalid AI provider input'
  return {
    field: fieldName,
    message,
  }
}

function validationFieldsFromError(err) {
  if (err instanceof ZodError || err.name === 'ZodError') {
    return validationFieldsFromIssues(err.issues)
  }
  return Array.isArray(err.fields)
    ? err.fields.map(sanitizeValidationField).filter(Boolean)
    : []
}

function sendValidationError(err, res) {
  const error = {
    code: 'VALIDATION_ERROR',
    message: 'Invalid AI provider input',
  }
  const fields = validationFieldsFromError(err)
  if (fields.length > 0) {
    error.fields = fields
  }
  res.status(422).json({
    error,
  })
}

function sendProviderError(res) {
  res.status(502).json({
    error: {
      code: 'PROVIDER_ERROR',
      message: 'AI provider request failed',
    },
  })
}

function scrubProviderSecrets(value) {
  if (Array.isArray(value)) {
    return value.map(scrubProviderSecrets)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROVIDER_SECRET_FIELDS.has(key))
      .map(([key, nestedValue]) => [key, scrubProviderSecrets(nestedValue)])
  )
}

function handleControllerError(err, res, next) {
  if (err instanceof ZodError || err.name === 'ZodError') {
    return sendValidationError(err, res)
  }
  if (
    err instanceof AiProviderValidationError ||
    err.name === 'AiProviderValidationError'
  ) {
    return sendValidationError(err, res)
  }
  if (err instanceof AiProviderError || err.name === 'AiProviderError') {
    return sendProviderError(res)
  }
  return next(err)
}

async function list(req, res, next) {
  try {
    res.json(scrubProviderSecrets({ providers: await listProviders() }))
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function create(req, res, next) {
  try {
    res
      .status(201)
      .json(scrubProviderSecrets({ provider: await createProvider(req.body) }))
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function update(req, res, next) {
  try {
    const provider = await updateProvider(req.params.providerId, req.body)
    if (!provider) {
      return res.sendStatus(404)
    }
    res.json(scrubProviderSecrets({ provider }))
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function remove(req, res, next) {
  try {
    const deleted = await deleteProvider(req.params.providerId)
    if (!deleted) {
      return res.sendStatus(404)
    }
    res.sendStatus(204)
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function syncModelsController(req, res, next) {
  try {
    const provider = await syncModels(req.params.providerId)
    if (!provider) {
      return res.sendStatus(404)
    }
    res.json(scrubProviderSecrets({ provider }))
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function testProviderController(req, res, next) {
  try {
    const result = await testProvider(req.params.providerId)
    if (!result) {
      return res.sendStatus(404)
    }
    res.json(scrubProviderSecrets(result))
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

export default {
  list,
  create,
  update,
  delete: remove,
  syncModels: syncModelsController,
  testProvider: testProviderController,
}
