import { ComponentProps } from 'react'
import HotkeysModal from '../js/features/hotkeys-modal/components/hotkeys-modal'

type HotkeysModalProps = ComponentProps<typeof HotkeysModal>

export const Default = (args: HotkeysModalProps) => {
  return <HotkeysModal {...args} />
}

export const MacModifier = (args: HotkeysModalProps) => {
  return <HotkeysModal {...args} isMac />
}

export default {
  title: 'Editor / Modals / Hotkeys',
  component: HotkeysModal,
  args: {
    animation: false,
    show: true,
    isMac: false,
  },
  argTypes: {
    handleHide: { action: 'handleHide' },
  },
}
