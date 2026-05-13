import { useState, useEffect, useCallback } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import Cell from './cell'
import Layout from './add-email/layout'
import Input from './add-email/input'
import AddAnotherEmailBtn from './add-email/add-another-email-btn'
import AddNewEmailBtn from './add-email/add-new-email-btn'
import useAsync from '../../../../shared/hooks/use-async'
import { useUserEmailsContext } from '../../context/user-email-context'
import { postJSON } from '../../../../infrastructure/fetch-json'
import { isValidEmail } from '../../../../shared/utils/email'
import getMeta from '../../../../utils/meta'
import { ReCaptcha2 } from '../../../../shared/components/recaptcha-2'
import { useRecaptcha } from '../../../../shared/hooks/use-recaptcha'
import OLCol from '@/shared/components/ol/ol-col'
import { ConfirmEmailForm } from '@/features/settings/components/emails/confirm-email-form'
import RecaptchaConditions from '@/shared/components/recaptcha-conditions'

function AddEmail() {
  const { t } = useTranslation()
  const [isFormVisible, setIsFormVisible] = useState(
    () => window.location.hash === '#add-email'
  )
  const [newEmail, setNewEmail] = useState('')
  const [confirmationStep, setConfirmationStep] = useState(false)
  const { isLoading, isError, error, runAsync } = useAsync()
  const {
    state,
    setLoading: setUserEmailsContextLoading,
    getEmails,
  } = useUserEmailsContext()

  const emailAddressLimit = getMeta('ol-emailAddressLimit') || 10
  const { ref: recaptchaRef, getReCaptchaToken } = useRecaptcha()

  useEffect(() => {
    setUserEmailsContextLoading(isLoading)
  }, [setUserEmailsContextLoading, isLoading])

  const handleShowAddEmailForm = () => {
    setIsFormVisible(true)
  }

  const handleEmailChange = useCallback((value: string) => {
    setNewEmail(value)
  }, [])

  const handleAddNewEmail = () => {
    if (!isValidEmail(newEmail)) {
      return
    }
    runAsync(
      (async () => {
        const token = await getReCaptchaToken()
        await postJSON('/user/emails/secondary', {
          body: {
            email: newEmail,
            'g-recaptcha-response': token,
          },
        })
      })()
    )
      .then(() => {
        setConfirmationStep(true)
      })
      .catch(() => {})
  }

  if (confirmationStep) {
    return (
      <ConfirmEmailForm
        confirmationEndpoint="/user/emails/confirm-secondary"
        resendEndpoint="/user/emails/resend-secondary-confirmation"
        flow="secondary"
        email={newEmail}
        onSuccessfulConfirmation={getEmails}
        interstitial={false}
        onCancel={() => {
          setConfirmationStep(false)
          setIsFormVisible(false)
        }}
      />
    )
  }

  if (!isFormVisible) {
    return (
      <Layout isError={isError} error={error}>
        <OLCol lg={12}>
          <Cell>
            {state.data.emailCount >= emailAddressLimit ? (
              <span className="small">
                <Trans
                  i18nKey="email_limit_reached"
                  values={{
                    emailAddressLimit,
                  }}
                  shouldUnescape
                  tOptions={{ interpolation: { escapeValue: true } }}
                  components={[<strong />]} // eslint-disable-line react/jsx-key
                />
              </span>
            ) : (
              <AddAnotherEmailBtn onClick={handleShowAddEmailForm} />
            )}
          </Cell>
        </OLCol>
      </Layout>
    )
  }

  const InputComponent = (
    <>
      <label htmlFor="secondary-email">{t('email')}</label>
      <Input
        onChange={handleEmailChange}
        handleAddNewEmail={handleAddNewEmail}
      />
    </>
  )
  const recaptchaConditions = (
    <OLCol>
      <Cell>
        <div className="affiliations-table-cell-tabbed">
          <RecaptchaConditions />
        </div>
      </Cell>
    </OLCol>
  )

  if (!isValidEmail(newEmail)) {
    return (
      <form>
        <Layout isError={isError} error={error}>
          <ReCaptcha2 page="addEmail" recaptchaRef={recaptchaRef} />
          <OLCol lg={8}>
            <Cell>
              {InputComponent}
              <div className="affiliations-table-cell-tabbed">
                <div>{t('start_by_adding_your_email')}</div>
              </div>
            </Cell>
          </OLCol>
          <OLCol lg={4}>
            <Cell className="text-lg-end">
              <AddNewEmailBtn email={newEmail} disabled />
            </Cell>
          </OLCol>
          {recaptchaConditions}
        </Layout>
      </form>
    )
  }

  return (
    <form>
      <Layout isError={isError} error={error}>
        <ReCaptcha2 page="addEmail" recaptchaRef={recaptchaRef} />
        <OLCol lg={8}>
          <Cell>
            {InputComponent}
          </Cell>
        </OLCol>
        <OLCol lg={4}>
          <Cell className="text-lg-end">
            <AddNewEmailBtn
              email={newEmail}
              disabled={state.isLoading}
              isLoading={isLoading}
              onClick={handleAddNewEmail}
            />
          </Cell>
        </OLCol>
        {recaptchaConditions}
      </Layout>
    </form>
  )
}

export default AddEmail
