import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AiProviderModelSchema = new Schema(
  {
    id: { type: String },
    displayName: { type: String },
    source: {
      type: String,
      enum: ['manual', 'synced'],
      default: 'manual',
    },
    enabled: { type: Boolean, default: true },
  },
  { _id: false, minimize: false }
)

export const AiProviderSchema = new Schema(
  {
    name: { type: String, required: true },
    providerType: {
      type: String,
      enum: ['openai-compatible'],
      default: 'openai-compatible',
    },
    baseURL: { type: String, required: true },
    encryptedApiKey: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    models: [AiProviderModelSchema],
    defaultModel: { type: String, default: null },
    lastModelSyncAt: { type: Date, default: null },
    healthStatus: {
      type: String,
      enum: ['unknown', 'ok', 'error'],
      default: 'unknown',
    },
    lastHealthCheckAt: { type: Date, default: null },
    lastHealthError: { type: String, default: null },
  },
  {
    collection: 'aiProviders',
    minimize: false,
    timestamps: true,
  }
)

export const AiProvider = mongoose.model('AiProvider', AiProviderSchema)
