import { useTranslation } from 'react-i18next'
import {
  DeprecatedBrowser,
  isDeprecatedBrowser,
} from '@/shared/components/deprecated-browser'

function UserNotifications() {
  const { t } = useTranslation()

  return (
    <section
      className="user-notifications notification-list"
      aria-label={t('notification')}
    >
      <ul className="list-unstyled">
        {isDeprecatedBrowser() && <DeprecatedBrowser />}
      </ul>
    </section>
  )
}

export default UserNotifications
