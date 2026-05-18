import { useTranslation } from 'react-i18next'
import NavDropdownMenu from '@/shared/components/navbar/nav-dropdown-menu'
import type { NavbarSessionUser } from '@/shared/components/types/navbar'
import NavLinkItem from '@/shared/components/navbar/nav-link-item'
import { AccountMenuItems } from './account-menu-items'
import { useSendProjectListMB } from '@/features/project-list/components/project-list-events'
import type { NavbarLanguage } from '@/shared/components/types/navbar'

export default function LoggedInItems({
  sessionUser,
  currentLangCode,
  selectableLanguages,
}: {
  sessionUser: NavbarSessionUser
  currentLangCode?: string
  selectableLanguages?: NavbarLanguage[]
}) {
  const { t } = useTranslation()
  const sendProjectListMB = useSendProjectListMB()
  return (
    <>
      <NavLinkItem href="/project" className="nav-item-projects">
        {t('projects')}
      </NavLinkItem>
      <NavDropdownMenu
        title={t('Account')}
        className="nav-item-account"
        onToggle={nextShow => {
          if (nextShow) {
            sendProjectListMB('menu-expand', {
              item: 'account',
              location: 'top-menu',
            })
          }
        }}
      >
        <AccountMenuItems
          sessionUser={sessionUser}
          currentLangCode={currentLangCode}
          selectableLanguages={selectableLanguages}
        />
      </NavDropdownMenu>
    </>
  )
}
