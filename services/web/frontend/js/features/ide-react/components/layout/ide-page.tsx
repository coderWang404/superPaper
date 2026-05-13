import { Alerts } from '@/features/ide-react/components/alerts/alerts'
import { useLayoutEventTracking } from '@/features/ide-react/hooks/use-layout-event-tracking'
import useSocketListeners from '@/features/ide-react/hooks/use-socket-listeners'
import { useRegisterUserActivity } from '@/features/ide-react/hooks/use-register-user-activity'
import { useHasLintingError } from '@/features/ide-react/hooks/use-has-linting-error'
import { Modals } from '@/features/ide-react/components/modals/modals'
import { GlobalAlertsProvider } from '@/features/ide-react/context/global-alerts-context'
import { GlobalToasts } from '../global-toasts'
import { useStatusFavicon } from '@/features/ide-react/hooks/use-status-favicon'
import useThemedPage from '@/shared/hooks/use-themed-page'

import MainLayout from '@/features/ide-react/components/layout/main-layout'
import SettingsModalNew from '@/features/settings/components/settings-modal'

export default function IdePage() {
  useLayoutEventTracking() // sent event when the layout changes
  useSocketListeners() // listen for project-related websocket messages
  useRegisterUserActivity() // record activity and ensure connection when user is active
  useHasLintingError() // pass editor:lint hasLintingError to the compiler
  useStatusFavicon() // update the favicon based on the compile status
  useThemedPage() // set the page theme based on user settings

  return (
    <GlobalAlertsProvider>
      <Alerts />
      <Modals />
      <SettingsModalNew />
      <MainLayout />
      <GlobalToasts />
    </GlobalAlertsProvider>
  )
}
