import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AgentPluginInstallationSchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'project'],
      required: true,
      index: true,
    },
    projectId: { type: Schema.Types.ObjectId, default: null, index: true },
    pluginId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    version: { type: String, required: true },
    displayName: { type: String, default: null },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['installed', 'disabled', 'orphaned', 'failed'],
      default: 'installed',
      index: true,
    },
    manifest: { type: Schema.Types.Mixed, default: {} },
    manifestFormat: {
      type: String,
      enum: ['superpaper', 'codex', 'claude'],
      required: true,
    },
    manifestPath: { type: String, required: true },
    source: { type: Schema.Types.Mixed, default: {} },
    integrity: { type: Schema.Types.Mixed, default: {} },
    cachePath: { type: String, default: null },
    packageBytes: { type: Number, default: 0 },
    fileCount: { type: Number, default: 0 },
    skillIds: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    installedBy: { type: Schema.Types.ObjectId, default: null },
    updatedBy: { type: Schema.Types.ObjectId, default: null },
  },
  {
    collection: 'agentPluginInstallations',
    minimize: false,
    timestamps: true,
  }
)

AgentPluginInstallationSchema.index(
  { scope: 1, projectId: 1, pluginId: 1, version: 1 },
  { unique: true }
)

export const AgentPluginInstallation = mongoose.model(
  'AgentPluginInstallation',
  AgentPluginInstallationSchema
)
