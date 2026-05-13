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
      {integrationPanelComponents.map(
        ({ import: { default: Component }, path }) => (
          <Component key={path} />
        )
      )}
    </div>
  )
}
