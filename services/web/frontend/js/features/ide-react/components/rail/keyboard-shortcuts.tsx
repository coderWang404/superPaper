import { FC } from 'react'
import HotkeysModal from '@/features/hotkeys-modal/components/hotkeys-modal'
import { isMac } from '@/shared/utils/os'
import { useRailContext } from '../../../ide-react/context/rail-context'

export const RailHelpShowHotkeysModal: FC<{ show: boolean }> = ({ show }) => {
  const { setActiveModal } = useRailContext()

  return (
    <HotkeysModal
      show={show}
      handleHide={() => setActiveModal(null)}
      isMac={isMac}
    />
  )
}
