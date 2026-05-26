import { ElementType } from 'react'
import importSuperPaperModules from '../../../macros/import-superpaper-module.macro'
import { useTranslation } from 'react-i18next'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'

const integrationPanelComponents = importSuperPaperModules(
  'integrationPanelComponents'
) as { import: { default: ElementType }; path: string }[]

export default function IntegrationsPanel() {
  const { t } = useTranslation()

  return (
    <div className="integrations-panel">
      <RailPanelHeader title={t('integrations')} />
      {integrationPanelComponents.length === 0 ? (
        <div className="integrations-panel-empty" role="status">
          <span className="material-symbols" aria-hidden="true">
            extension_off
          </span>
          <strong>{t('no_integrations_available')}</strong>
          <p>{t('integrations_empty_description')}</p>
        </div>
      ) : (
        integrationPanelComponents.map(
          ({ import: { default: Component }, path }) => (
            <Component key={path} />
          )
        )
      )}
    </div>
  )
}
