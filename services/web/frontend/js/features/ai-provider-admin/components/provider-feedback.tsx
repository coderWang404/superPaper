import { safeMessageFromSafeError } from '../api'
import type { SafeApiError } from '../types'
import type { TranslationKey } from '../translations'

type ProviderFeedbackProps = {
  loading: boolean
  statusMessage: TranslationKey | null
  error: SafeApiError | null
  t: (key: TranslationKey) => string
}

export function ProviderFeedback({
  loading,
  statusMessage,
  error,
  t,
}: ProviderFeedbackProps) {
  const statusText = loading
    ? t('loading')
    : statusMessage
      ? t(statusMessage)
      : ''

  return (
    <div className="ai-provider-admin-feedback">
      <div className="text-muted" role="status">
        {statusText}
      </div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {safeMessageFromSafeError(error) || t('requestFailed')}
        </div>
      ) : null}
    </div>
  )
}
