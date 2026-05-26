/* eslint-disable @superpaper/require-script-runner */
// Local/CI browser smoke config only; it must not depend on app ScriptLog state.

const DEFAULT_BASE_URL = 'http://127.0.0.1:23000'
const DEFAULT_PROVIDER_NAME = 'Root Channel Provider'
const DEFAULT_MODEL = 'gpt-5.2'
const DEFAULT_SCREENSHOT_DIR = 'output/playwright'
const DEFAULT_TIMEOUT_MS = 180000
const DEFAULT_PROMPT =
  'Run a low-impact Cline browser smoke check. Inspect the project and report whether direct workspace editing is available. Do not modify files.'
const DEFAULT_EDIT_FILE = 'main.tex'
const DEFAULT_EDIT_MARKER = 'SUPERPAPER_DIRECT_EDIT_SMOKE'
const DEFAULT_LOCALE = 'en'
const DEFAULT_LANGUAGE_COOKIE_NAME = 'superpaper_lang'
const LOCALE_EXPECTATIONS = {
  en: {
    aiAssistantTab: 'AI Assistant',
    aiAssistantHeading: 'AI Assistant',
    promptLabel: 'Ask about this project',
    providerLabel: 'Provider',
    modelLabel: 'Model',
    runButton: 'Plan',
    runSummary: 'Run summary',
    detailedWorklog: 'Detailed work log',
    clineRuntime: 'Cline runtime',
    shellEnabled: 'Shell: enabled',
    externalToolsDisabled: 'External tools: disabled',
    mcpDisabled: 'MCP: disabled',
    subagentsDisabled: 'Subagents: disabled',
    beforeCommit: 'Before',
    afterCommit: 'After',
    result: 'Result',
    actCompleted: 'Act: completed',
    firstCompilerError: 'First compiler error',
    fixWithAgent: 'Fix with Agent',
  },
  'zh-CN': {
    aiAssistantTab: 'AI 助手',
    aiAssistantHeading: 'AI 助手',
    promptLabel: '询问当前项目',
    providerLabel: '渠道',
    modelLabel: '模型',
    runButton: '规划',
    runSummary: '运行摘要',
    detailedWorklog: '详细工作日志',
    clineRuntime: 'Cline 运行时',
    shellEnabled: 'Shell：已启用',
    externalToolsDisabled: '外部工具：已禁用',
    mcpDisabled: 'MCP：已禁用',
    subagentsDisabled: '子 Agent：已禁用',
    beforeCommit: '之前',
    afterCommit: '之后',
    result: '结果',
    actCompleted: '执行：已完成',
    firstCompilerError: '第一个编译错误',
    fixWithAgent: '交给 Agent 修复',
  },
}

export function buildClineBrowserSmokeConfig(env = process.env) {
  const locale = normalizeLocale(env.SUPERPAPER_SMOKE_LOCALE)
  const directEdit = buildDirectEditConfig(env)

  return {
    baseUrl: normalizeBaseUrl(env.SUPERPAPER_BASE_URL || DEFAULT_BASE_URL),
    email: requireEnv(env, 'SUPERPAPER_SMOKE_EMAIL'),
    password: requireEnv(env, 'SUPERPAPER_SMOKE_PASSWORD'),
    projectId: requireEnv(env, 'SUPERPAPER_SMOKE_PROJECT_ID'),
    providerName:
      env.SUPERPAPER_SMOKE_PROVIDER_NAME?.trim() || DEFAULT_PROVIDER_NAME,
    model: env.SUPERPAPER_SMOKE_MODEL?.trim() || DEFAULT_MODEL,
    prompt:
      env.SUPERPAPER_SMOKE_PROMPT?.trim() ||
      (directEdit.enabled ? buildDirectEditPrompt(directEdit) : DEFAULT_PROMPT),
    headless: parseBoolean(env.SUPERPAPER_SMOKE_HEADLESS, true),
    screenshotDir:
      env.SUPERPAPER_SMOKE_SCREENSHOT_DIR?.trim() || DEFAULT_SCREENSHOT_DIR,
    timeoutMs: parseTimeout(env.SUPERPAPER_SMOKE_TIMEOUT_MS),
    locale,
    languageCookieName:
      env.SUPERPAPER_LANGUAGE_COOKIE_NAME?.trim() ||
      DEFAULT_LANGUAGE_COOKIE_NAME,
    expected: {
      ...LOCALE_EXPECTATIONS[locale],
      compileDiagnosticHandoff: !directEdit.enabled,
    },
    directEdit,
  }
}

function buildDirectEditConfig(env) {
  const enabled = parseBoolean(env.SUPERPAPER_SMOKE_DIRECT_EDIT, false)
  return {
    enabled,
    file: env.SUPERPAPER_SMOKE_EDIT_FILE?.trim() || DEFAULT_EDIT_FILE,
    marker: env.SUPERPAPER_SMOKE_EDIT_MARKER?.trim() || DEFAULT_EDIT_MARKER,
  }
}

function buildDirectEditPrompt(directEdit) {
  return `Directly edit ${directEdit.file} in this project. Add a single LaTeX comment line containing ${directEdit.marker}. Keep the document valid and do not modify any other file.`
}

export function buildLocaleCookie(config) {
  if (config.locale === DEFAULT_LOCALE) {
    return null
  }

  return {
    name: config.languageCookieName,
    value: config.locale,
    url: config.baseUrl,
  }
}

export function redactClineBrowserSmokeConfig(config) {
  return {
    ...config,
    password: '[redacted]',
  }
}

function requireEnv(env, key) {
  const value = env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is required`)
  }
  return value
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, '')
}

function normalizeLocale(rawLocale) {
  const locale = rawLocale?.trim() || DEFAULT_LOCALE
  return Object.hasOwn(LOCALE_EXPECTATIONS, locale) ? locale : DEFAULT_LOCALE
}

function parseBoolean(rawValue, defaultValue) {
  if (rawValue == null || rawValue === '') {
    return defaultValue
  }
  const normalized = rawValue.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  throw new Error(`Invalid boolean value: ${rawValue}`)
}

function parseTimeout(rawValue) {
  if (rawValue == null || rawValue === '') {
    return DEFAULT_TIMEOUT_MS
  }
  const timeoutMs = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid SUPERPAPER_SMOKE_TIMEOUT_MS: ${rawValue}`)
  }
  return timeoutMs
}
