import { useTranslation } from 'react-i18next'
import { useProjectContext } from '@/shared/context/project-context'
import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'
import OLNotification from '@/shared/components/ol/ol-notification'
import { useFeatureFlag } from '@/shared/context/split-test-context'

function SendInvitesNotice() {
  const isSharingUpdatesEnabled = useFeatureFlag('sharing-updates')
  const { project } = useProjectContext()
  const { publicAccessLevel } = project || {}
  const { t } = useTranslation()

  let accessLevelText = ''
  if (publicAccessLevel === 'private') {
    accessLevelText = t('to_add_more_collaborators')
  } else if (publicAccessLevel === 'tokenBased') {
    accessLevelText = t('to_change_access_permissions')
  }

  return (
    <div>
      {accessLevelText &&
        (isSharingUpdatesEnabled ? (
          <OLNotification type="info" content={accessLevelText} />
        ) : (
          <OLRow className="public-access-level public-access-level-notice">
            <OLCol className="text-center">
              <span>{accessLevelText}</span>
            </OLCol>
          </OLRow>
        ))}
    </div>
  )
}

export default SendInvitesNotice
