import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AgentPluginSettingSchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'project'],
      required: true,
      index: true,
    },
    projectId: { type: Schema.Types.ObjectId, default: null, index: true },
    pluginId: { type: String, required: true, index: true },
    enabled: { type: Boolean, default: true },
    name: { type: String, default: null },
    version: { type: String, default: null },
    displayName: { type: String, default: null },
    description: { type: String, default: null },
    manifest: { type: Schema.Types.Mixed, default: {} },
    skills: { type: [String], default: [] },
    toolPresets: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, default: null },
    updatedBy: { type: Schema.Types.ObjectId, default: null },
  },
  {
    collection: 'agentPluginSettings',
    minimize: false,
    timestamps: true,
  }
)

AgentPluginSettingSchema.index(
  { scope: 1, projectId: 1, pluginId: 1 },
  { unique: true }
)

export const AgentPluginSetting = mongoose.model(
  'AgentPluginSetting',
  AgentPluginSettingSchema
)
