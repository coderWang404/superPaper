import { useTranslation } from 'react-i18next'
import NavLinkItem from '@/shared/components/navbar/nav-link-item'
import { useSendProjectListMB } from '@/features/project-list/components/project-list-events'
import NavDropdownMenu from '@/shared/components/navbar/nav-dropdown-menu'
import LanguageMenu from './language-menu'
import type { NavbarLanguage } from '@/shared/components/types/navbar'

export default function LoggedOutItems({
  showSignUpLink,
  currentLangCode,
  selectableLanguages,
}: {
  showSignUpLink: boolean
  currentLangCode?: string
  selectableLanguages?: NavbarLanguage[]
}) {
  const { t } = useTranslation()
  const sendMB = useSendProjectListMB()
  const visibleLanguages = selectableLanguages ?? []
  const showLanguageMenu = visibleLanguages.length > 1

  return (
    <>
      {showLanguageMenu ? (
        <NavDropdownMenu title={t('language')} className="nav-item-language">
          <LanguageMenu
            currentLangCode={currentLangCode}
            selectableLanguages={visibleLanguages}
            showDivider={false}
          />
        </NavDropdownMenu>
      ) : null}
      {showSignUpLink ? (
        <NavLinkItem
          href="/register"
          className="primary nav-account-item"
          onClick={() => {
            sendMB('menu-click', { item: 'register', location: 'top-menu' })
          }}
        >
          {t('sign_up')}
        </NavLinkItem>
      ) : null}
      <NavLinkItem
        href="/login"
        className="nav-account-item"
        onClick={() => {
          sendMB('menu-click', { item: 'login', location: 'top-menu' })
        }}
      >
        {t('log_in')}
      </NavLinkItem>
    </>
  )
}
