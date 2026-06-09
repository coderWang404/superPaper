import getMeta from '@/utils/meta'

export type AdminLanguage = 'en' | 'zh'

export type TranslationKey =
  | 'actions'
  | 'addProvider'
  | 'addProviderDescription'
  | 'addProviderForm'
  | 'apiKey'
  | 'apiKeyReplaced'
  | 'apiKeyStored'
  | 'baseURL'
  | 'cancel'
  | 'confirmDelete'
  | 'default'
  | 'defaultModel'
  | 'delete'
  | 'disabled'
  | 'disable'
  | 'enabled'
  | 'enable'
  | 'health'
  | 'loading'
  | 'modelIds'
  | 'modelIdsHelp'
  | 'models'
  | 'modelsSynced'
  | 'name'
  | 'newApiKey'
  | 'newApiKeyFor'
  | 'noApiKeyStored'
  | 'noProviders'
  | 'noModels'
  | 'none'
  | 'providerConfigured'
  | 'providerAdded'
  | 'providerDeleted'
  | 'providerDisabled'
  | 'providerEnabled'
  | 'providerName'
  | 'providers'
  | 'providersDescription'
  | 'providerTestFailed'
  | 'providerTestPassed'
  | 'replaceKey'
  | 'replaceKeyBusy'
  | 'replaceKeyFor'
  | 'replaceProviderKeyFor'
  | 'requestFailed'
  | 'presetChannels'
  | 'selectPreset'
  | 'syncingModels'
  | 'syncModels'
  | 'syncModelsFor'
  | 'test'
  | 'testingProvider'
  | 'unknown'

export const TRANSLATIONS: Record<
  AdminLanguage,
  Record<TranslationKey, string>
> = {
  en: {
    actions: 'Actions',
    addProvider: 'Add provider',
    addProviderDescription:
      'Register an OpenAI-compatible endpoint. Keys stay server-side and are never rendered back to the browser.',
    addProviderForm: 'Add AI provider',
    apiKey: 'API key',
    apiKeyReplaced: 'API key replaced',
    apiKeyStored: 'API key stored',
    baseURL: 'Base URL',
    cancel: 'Cancel',
    confirmDelete: 'Delete AI provider',
    default: 'Default',
    defaultModel: 'Default model',
    delete: 'Delete',
    disabled: 'Disabled',
    disable: 'Disable',
    enabled: 'Enabled',
    enable: 'Enable',
    health: 'Health',
    loading: 'Loading AI providers...',
    modelIds: 'Model IDs',
    modelIdsHelp:
      'Use commas or new lines, for example: gpt-4.1, deepseek-chat.',
    models: 'Models',
    modelsSynced: 'Models synced',
    name: 'Name',
    newApiKey: 'New API key',
    newApiKeyFor: 'New API key for',
    noApiKeyStored: 'No API key stored',
    noProviders: 'No AI providers configured',
    noModels: 'No models',
    none: 'None',
    providerConfigured: 'Providers configured',
    providerAdded: 'Provider added',
    providerDeleted: 'Provider deleted',
    providerDisabled: 'Provider disabled',
    providerEnabled: 'Provider enabled',
    providerName: 'Provider name',
    providers: 'AI providers',
    providersDescription:
      'Manage model gateways used by project chat and Agent mode.',
    providerTestFailed: 'Provider test failed',
    providerTestPassed: 'Provider test passed',
    replaceKey: 'Replace key',
    replaceKeyBusy: 'Replacing...',
    replaceKeyFor: 'Replace',
    replaceProviderKeyFor: 'Replace key for',
    requestFailed: 'AI provider request failed',
    syncingModels: 'Syncing...',
    syncModels: 'Sync models',
    syncModelsFor: 'Sync models for __provider__',
    test: 'Test',
    testingProvider: 'Testing...',
    unknown: 'unknown',
    presetChannels: 'Preset channels',
    selectPreset: '-- Select preset --',
  },
  zh: {
    actions: '操作',
    addProvider: '添加供应商',
    addProviderDescription:
      '注册 OpenAI 兼容接口。密钥只保存在服务端，不会回传到浏览器。',
    addProviderForm: '添加 AI 供应商',
    apiKey: 'API 密钥',
    apiKeyReplaced: 'API 密钥已替换',
    apiKeyStored: 'API 密钥已保存',
    baseURL: 'Base URL',
    cancel: '取消',
    confirmDelete: '删除 AI 供应商',
    default: '默认',
    defaultModel: '默认模型',
    delete: '删除',
    disabled: '已禁用',
    disable: '禁用',
    enabled: '已启用',
    enable: '启用',
    health: '健康状态',
    loading: '正在加载 AI 供应商...',
    modelIds: '模型 ID',
    modelIdsHelp: '可使用逗号或换行分隔，例如：gpt-4.1, deepseek-chat。',
    models: '模型',
    modelsSynced: '模型已同步',
    name: '名称',
    newApiKey: '新 API 密钥',
    newApiKeyFor: '新的 API 密钥：',
    noApiKeyStored: '未保存 API 密钥',
    noProviders: '尚未配置 AI 供应商',
    noModels: '无模型',
    none: '无',
    providerConfigured: '已配置供应商',
    providerAdded: '供应商已添加',
    providerDeleted: '供应商已删除',
    providerDisabled: '供应商已禁用',
    providerEnabled: '供应商已启用',
    providerName: '供应商名称',
    providers: 'AI 供应商',
    providersDescription: '管理项目聊天和 Agent 模式使用的模型网关。',
    providerTestFailed: '供应商测试失败',
    providerTestPassed: '供应商测试通过',
    replaceKey: '替换密钥',
    replaceKeyBusy: '正在替换...',
    replaceKeyFor: '替换',
    replaceProviderKeyFor: '替换密钥：',
    requestFailed: 'AI 供应商请求失败',
    syncingModels: '正在同步...',
    syncModels: '同步模型',
    syncModelsFor: '同步 __provider__ 的模型',
    test: '测试',
    testingProvider: '正在测试...',
    unknown: '未知',
    presetChannels: '预设渠道',
    selectPreset: '-- 选择预设渠道 --',
  },
}

export function getAdminLanguage(): AdminLanguage {
  const language = getMeta('ol-i18n')?.currentLangCode || 'en'
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function createAdminTranslator(language = getAdminLanguage()) {
  return function t(key: TranslationKey) {
    return TRANSLATIONS[language][key]
  }
}
