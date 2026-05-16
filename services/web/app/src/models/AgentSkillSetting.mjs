import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AgentSkillSettingSchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'project'],
      required: true,
      index: true,
    },
    projectId: { type: Schema.Types.ObjectId, default: null, index: true },
    skillId: { type: String, required: true, index: true },
    enabled: { type: Boolean, default: true },
    displayName: { type: String, default: null },
    description: { type: String, default: null },
    modelInvocable: { type: Boolean, default: true },
    requiredTools: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    content: { type: String, default: '' },
    pluginId: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, default: null },
    updatedBy: { type: Schema.Types.ObjectId, default: null },
  },
  {
    collection: 'agentSkillSettings',
    minimize: false,
    timestamps: true,
  }
)

AgentSkillSettingSchema.index(
  { scope: 1, projectId: 1, skillId: 1 },
  { unique: true }
)

export const AgentSkillSetting = mongoose.model(
  'AgentSkillSetting',
  AgentSkillSettingSchema
)
