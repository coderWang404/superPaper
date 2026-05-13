import AddCollaborators from './add-collaborators'
import AccessLevelsChanged from './access-levels-changed'
import OLRow from '@/shared/components/ol/ol-row'
import classnames from 'classnames'
import { useFeatureFlag } from '@/shared/context/split-test-context'

export default function SendInvites({
  canAddCollaborators,
  haveAnyEditorsBeenDowngraded,
  somePendingEditorsResolved,
}: {
  canAddCollaborators: boolean
  haveAnyEditorsBeenDowngraded: boolean
  somePendingEditorsResolved: boolean
}) {
  const isSharingUpdatesEnabled = useFeatureFlag('sharing-updates')

  return (
    <OLRow
      className={classnames('invite-controls', {
        'pb-3': isSharingUpdatesEnabled,
      })}
    >
      {haveAnyEditorsBeenDowngraded && (
        <AccessLevelsChanged
          somePendingEditorsResolved={somePendingEditorsResolved}
        />
      )}
      <AddCollaborators readOnly={!canAddCollaborators} />
    </OLRow>
  )
}
