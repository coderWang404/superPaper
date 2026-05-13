import { useTranslation, Trans } from 'react-i18next'
import getMeta from '../../../../utils/meta'
import { FetchError } from '../../../../infrastructure/fetch-json'
import OLNotification from '@/shared/components/ol/ol-notification'

type LeaveModalFormErrorProps = {
  error: FetchError
}

function LeaveModalFormError({ error }: LeaveModalFormErrorProps) {
  const { t } = useTranslation()
  const { isSuperPaper } = getMeta('ol-ExposedSettings')

  let errorMessage
  let errorTip = null
  if (error.response?.status === 403) {
    errorMessage = t('email_or_password_wrong_try_again')
    if (isSuperPaper) {
      errorTip = (
        <Trans
          i18nKey="user_deletion_password_reset_tip"
          // eslint-disable-next-line react/jsx-key, jsx-a11y/anchor-has-content
          components={[<a href="/user/password/reset" />]}
        />
      )
    }
  } else {
    errorMessage = t('user_deletion_error')
  }

  return (
    <OLNotification
      type="error"
      content={
        <>
          {errorMessage}
          {errorTip ? (
            <>
              <br />
              {errorTip}
            </>
          ) : null}
        </>
      }
    />
  )
}

export default LeaveModalFormError
