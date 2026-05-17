import './utils/webpack-public-path'
import './infrastructure/error-reporter'
import './features/form-helpers/hydrate-form'
import './features/form-helpers/form-phosphor-icons'
import './features/form-helpers/password-visibility'
import './features/link-helpers/slow-link'
import './features/event-tracking'
import './features/fallback-image'
import './features/multi-submit'
import './features/cookie-banner'
import './features/autoplay-video'
import './features/mathjax'
import './features/contact-form'
import { initAiProviderAdmin } from './features/ai-provider-admin/ai-provider-admin'
import { initAiAgentPluginAdmin } from './features/ai-agent-plugin-admin/ai-agent-plugin-admin'

const aiProviderAdminRoot = document.querySelector<HTMLElement>(
  '#ai-provider-admin'
)

if (aiProviderAdminRoot) {
  initAiProviderAdmin(aiProviderAdminRoot)
}

const aiAgentPluginAdminRoot = document.querySelector<HTMLElement>(
  '#ai-agent-plugin-admin'
)

if (aiAgentPluginAdminRoot) {
  initAiAgentPluginAdmin(aiAgentPluginAdminRoot)
}
