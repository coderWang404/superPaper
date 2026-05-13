import EditMember from './edit-member'
import LinkSharing from './link-sharing'
import Invite from './invite'
import SendInvites from './send-invites'
import ViewMember from './view-member'
import OwnerInfo from './owner-info'
import SendInvitesNotice from './send-invites-notice'
import { useEditorContext } from '@/shared/context/editor-context'
import { useProjectContext } from '@/shared/context/project-context'
import { useMemo } from 'react'
import RecaptchaConditions from '@/shared/components/recaptcha-conditions'
import getMeta from '@/utils/meta'
import { useFeatureFlag } from '@/shared/context/split-test-context'
import OLNotification from '@/shared/components/ol/ol-notification'
import ErrorMessage from '@/features/share-project-modal/components/error-message'
import ProjectAccess from '@/features/share-project-modal/components/project-access'
import InvitedPeople from '@/features/share-project-modal/components/invited-people'

type ShareModalBodyProps = {
  isInvitedPeopleScreen: boolean
  setIsInvitedPeopleScreen: React.Dispatch<React.SetStateAction<boolean>>
  error?: string
}

export default function ShareModalBody({
  isInvitedPeopleScreen,
  setIsInvitedPeopleScreen,
  error,
}: ShareModalBodyProps) {
  const { project } = useProjectContext()
  const { members, invites } = project || {}
  const { isProjectOwner } = useEditorContext()
  const isSharingUpdatesEnabled = useFeatureFlag('sharing-updates')

  const canAddCollaborators = Boolean(isProjectOwner)

  // determine if some but not all pending editors' permissions have been resolved,
  // for moving between warning and info notification states etc.
  const somePendingEditorsResolved = useMemo(() => {
    return Boolean(
      members?.some(member =>
        ['readAndWrite', 'review'].includes(member.privileges)
      ) &&
      members?.some(member => member.pendingEditor || member.pendingReviewer)
    )
  }, [members])

  const haveAnyEditorsBeenDowngraded = useMemo(() => {
    return (
      members?.some(member => member.pendingEditor || member.pendingReviewer) ||
      false
    )
  }, [members])

  const sortedMembers = useMemo(() => {
    if (!members) {
      return []
    }
    return [
      ...members.filter(member => member.privileges === 'readAndWrite'),
      ...members.filter(member => member.pendingEditor),
      ...members.filter(member => member.privileges === 'review'),
      ...members.filter(member => member.pendingReviewer),
      ...members.filter(
        member =>
          !member.pendingEditor &&
          !member.pendingReviewer &&
          !['readAndWrite', 'review'].includes(member.privileges)
      ),
    ]
  }, [members])

  return (
    <>
      {isProjectOwner ? (
        <SendInvites
          canAddCollaborators={canAddCollaborators}
          haveAnyEditorsBeenDowngraded={haveAnyEditorsBeenDowngraded}
          somePendingEditorsResolved={somePendingEditorsResolved}
        />
      ) : (
        <SendInvitesNotice />
      )}

      {isSharingUpdatesEnabled ? (
        <>
          {error && (
            <OLNotification
              type="error"
              content={<ErrorMessage error={error} />}
            />
          )}
          {isInvitedPeopleScreen || !isProjectOwner ? (
            <InvitedPeople
              sortedMembers={sortedMembers}
              invites={invites}
            />
          ) : (
            <ProjectAccess
              setIsInvitedPeopleScreen={setIsInvitedPeopleScreen}
              // adding +1 for the project owner
              invitedPeopleCount={
                sortedMembers.length + (invites || []).length + 1
              }
            />
          )}
        </>
      ) : (
        <>
          {isProjectOwner && <LinkSharing />}

          <OwnerInfo />

          {sortedMembers.map(member =>
            isProjectOwner ? (
              <EditMember
                key={member._id}
                member={member}
                hasBeenDowngraded={Boolean(
                  member.pendingEditor || member.pendingReviewer
                )}
              />
            ) : (
              <ViewMember key={member._id} member={member} />
            )
          )}

          {(invites || []).map(invite => (
            <Invite
              key={invite._id}
              invite={invite}
              isProjectOwner={isProjectOwner}
            />
          ))}
        </>
      )}

      {!getMeta('ol-ExposedSettings').recaptchaDisabled?.invite && (
        <RecaptchaConditions />
      )}
    </>
  )
}
