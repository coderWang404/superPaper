import crypto from 'node:crypto'

const CIPHER_VERSION = 'sp-ai-v1'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getSecret(options = {}) {
  const secret =
    options.secret || process.env.AI_PROVIDER_SECRET || process.env.SESSION_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('AI provider encryption secret is not configured')
  }
  return secret
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest()
}

export async function encryptApiKey(apiKey, options = {}) {
  const secret = getSecret(options)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(secret), iv, {
    authTagLength: TAG_LENGTH,
  })
  const cipherText = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    cipherText.toString('base64url'),
  ].join(':')
}

export async function decryptApiKey(encryptedApiKey, options = {}) {
  const [version, iv, authTag, cipherText] = encryptedApiKey.split(':')
  if (version !== CIPHER_VERSION || !iv || !authTag || !cipherText) {
    throw new Error('Invalid AI provider encrypted API key')
  }
  const secret = getSecret(options)
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    deriveKey(secret),
    Buffer.from(iv, 'base64url'),
    { authTagLength: TAG_LENGTH }
  )
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function redactProvider(provider) {
  const plainProvider =
    typeof provider.toObject === 'function' ? provider.toObject() : provider
  return {
    id: plainProvider._id?.toString?.() || plainProvider.id,
    name: plainProvider.name,
    providerType: plainProvider.providerType,
    baseURL: plainProvider.baseURL,
    enabled: plainProvider.enabled,
    hasApiKey: Boolean(plainProvider.encryptedApiKey),
    models: plainProvider.models || [],
    defaultModel: plainProvider.defaultModel || null,
    lastModelSyncAt: plainProvider.lastModelSyncAt || null,
    healthStatus: plainProvider.healthStatus || 'unknown',
    createdAt: plainProvider.createdAt || null,
    updatedAt: plainProvider.updatedAt || null,
  }
}
