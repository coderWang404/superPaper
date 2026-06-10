import type { AiProvider } from '../types'
import type { TranslationKey } from '../translations'

type ProviderOverviewProps = {
  providers: AiProvider[]
  t: (key: TranslationKey) => string
}

export function ProviderOverview({ providers, t }: ProviderOverviewProps) {
  const enabledCount = providers.filter(provider => provider.enabled).length
  const modelCount = providers.reduce(
    (total, provider) => total + provider.models.length,
    0
  )
  const okCount = providers.filter(provider => provider.healthStatus === 'ok')
    .length

  return (
    <div className="ai-admin-overview" aria-label={t('providers')}>
      <Metric label={t('providerConfigured')} value={String(providers.length)} />
      <Metric label={t('enabled')} value={String(enabledCount)} />
      <Metric label={t('models')} value={String(modelCount)} />
      <Metric label={t('health')} value={`${okCount}/${providers.length || 0}`} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ai-admin-metric">
      <div className="ai-admin-metric-value">{value}</div>
      <div className="ai-admin-metric-label">{label}</div>
    </div>
  )
}
