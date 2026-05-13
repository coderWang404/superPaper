import { useTranslation } from 'react-i18next'
import OLButton from '@/shared/components/ol/ol-button'
import {
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'

type ViewOnlyAccessModalContentProps = {
  handleHide: () => void
}

export default function ViewOnlyAccessModalContent({
  handleHide,
}: ViewOnlyAccessModalContentProps) {
  const { t } = useTranslation()

  return (
    <>
      <OLModalHeader>
        <OLModalTitle>{t('view_only_access')}</OLModalTitle>
      </OLModalHeader>

      <OLModalBody>
        <p>You currently have view-only access to this project.</p>
        <p>Ask the project owner to update your role if you need to edit.</p>
      </OLModalBody>
      <OLModalFooter>
        <OLButton
          variant="primary"
          onClick={handleHide}
        >
          {t('ok')}
        </OLButton>
      </OLModalFooter>
    </>
  )
}
