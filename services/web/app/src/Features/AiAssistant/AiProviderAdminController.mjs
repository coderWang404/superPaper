import { ZodError } from 'zod'
import { AiProviderError } from './AiProviderClient.mjs'
import {
  createProvider,
  deleteProvider,
  listProviders,
  syncModels,
  testProvider,
  updateProvider,
} from './AiProviderManager.mjs'

function sendValidationError(res) {
  res.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid AI provider input',
    },
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

function handleControllerError(err, res, next) {
  if (err instanceof ZodError || err.name === 'ZodError') {
    return sendValidationError(res)
  }
  if (err instanceof AiProviderError || err.name === 'AiProviderError') {
    return sendProviderError(res)
  }
  return next(err)
}

async function list(req, res, next) {
  try {
    res.json({ providers: await listProviders() })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function create(req, res, next) {
  try {
    res.status(201).json({ provider: await createProvider(req.body) })
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
    res.json({ provider })
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
    res.json({ provider })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function testProviderController(req, res, next) {
  try {
    res.json(await testProvider(req.params.providerId))
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
