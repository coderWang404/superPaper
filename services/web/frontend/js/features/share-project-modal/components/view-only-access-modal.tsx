import { useEffect, useState } from 'react'
import ViewOnlyAccessModalContent from './view-only-access-modal-content'
import customLocalStorage from '@/infrastructure/local-storage'
import { useProjectContext } from '@/shared/context/project-context'
import { useEditorContext } from '@/shared/context/editor-context'
import { OLModal } from '@/shared/components/ol/ol-modal'

const ViewOnlyAccessModal = () => {
  const [show, setShow] = useState(false)

  const { isProjectOwner, isPendingEditor } = useEditorContext()
  const { projectId } = useProjectContext()

  const handleHide = () => {
    setShow(false)
  }

  // show the view-only access modal if the user is currently a pending editor
  useEffect(() => {
    const showModalCooldownHours = 24 * 7 // 7 days
    const shouldShowToPendingEditor = () => {
      return !isProjectOwner && isPendingEditor
    }

    if (shouldShowToPendingEditor()) {
      const localStorageKey = `last-shown-view-only-access-modal.${projectId}`
      const lastShownNeedEditModalTime =
        customLocalStorage.getItem(localStorageKey)
      if (
        !lastShownNeedEditModalTime ||
        lastShownNeedEditModalTime + showModalCooldownHours * 60 * 60 * 1000 <
          Date.now()
      ) {
        setShow(true)
        customLocalStorage.setItem(localStorageKey, Date.now())
      }
    }
  }, [isPendingEditor, isProjectOwner, projectId])

  return show ? (
    <OLModal
      animation
      show={show}
      onHide={() => {
        handleHide()
      }}
      id="view-only-access-modal"
    >
      <ViewOnlyAccessModalContent handleHide={handleHide} />
    </OLModal>
  ) : null
}

export default ViewOnlyAccessModal
