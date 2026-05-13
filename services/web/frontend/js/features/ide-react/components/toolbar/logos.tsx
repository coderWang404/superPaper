import OLTooltip from '@/shared/components/ol/ol-tooltip'
import MaterialIcon from '@/shared/components/material-icon'
import { useTranslation } from 'react-i18next'

export const ToolbarLogos = () => {
  const { t } = useTranslation()

  return (
    <div className="ide-redesign-toolbar-logos">
      <OLTooltip
        id="tooltip-home-button"
        description={t('back_to_your_projects')}
        overlayProps={{ delay: 0, placement: 'bottom' }}
      >
        <div className="ide-redesign-toolbar-home-button">
          <a href="/project" className="ide-redesign-toolbar-home-link">
            <span
              className="toolbar-ol-logo"
              aria-label={t('superPaper_logo')}
            />
            <MaterialIcon type="home" className="toolbar-ol-home-button" />
          </a>
        </div>
      </OLTooltip>
    </div>
  )
}
