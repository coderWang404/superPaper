import { useTranslation } from 'react-i18next'
import { ToolbarMenuBar } from './menu-bar'
import { ToolbarProjectTitle } from './project-title'
import { OnlineUsers } from './online-users'
import ShareProjectButton from './share-project-button'
import ChangeLayoutButton from './change-layout-button'
import ShowHistoryButton from './show-history-button'
import { useLayoutContext } from '@/shared/context/layout-context'
import BackToEditorButton from '@/features/editor-navigation-toolbar/components/back-to-editor-button'
import { useCallback } from 'react'
import * as eventTracking from '../../../../infrastructure/event-tracking'
import { ToolbarLogos } from './logos'
import getMeta from '@/utils/meta'

export const Toolbar = () => {
  const { view, restoreView } = useLayoutContext()
  const isRestrictedTokenMember = getMeta('ol-isRestrictedTokenMember')
  const { t } = useTranslation()

  const handleBackToEditorClick = useCallback(() => {
    eventTracking.sendMB('navigation-clicked-history', { action: 'close' })
    restoreView()
  }, [restoreView])

  if (view === 'history') {
    return (
      <nav className="ide-redesign-toolbar" aria-label={t('project_actions')}>
        <div className="d-flex align-items-center">
          <BackToEditorButton onClick={handleBackToEditorClick} />
        </div>
        <ToolbarProjectTitle />
        <div /> {/* Empty div used for spacing */}
      </nav>
    )
  }

  return (
    <nav className="ide-redesign-toolbar" aria-label={t('project_actions')}>
      <div className="ide-redesign-toolbar-menu">
        <ToolbarLogos />
        <ToolbarMenuBar />
      </div>
      <ToolbarProjectTitle />
      <div className="ide-redesign-toolbar-actions">
        <OnlineUsers />
        {!isRestrictedTokenMember && <ShowHistoryButton />}
        <ChangeLayoutButton />
        <ShareProjectButton />
      </div>
    </nav>
  )
}
