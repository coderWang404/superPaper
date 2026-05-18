import { Dropdown } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'
import DropdownListItem from '@/shared/components/dropdown/dropdown-list-item'
import NavDropdownDivider from './nav-dropdown-divider'
import MaterialIcon from '@/shared/components/material-icon'
import type { NavbarLanguage } from '@/shared/components/types/navbar'

export default function LanguageMenu({
  currentLangCode,
  selectableLanguages = [],
  showDivider = true,
}: {
  currentLangCode?: string
  selectableLanguages?: NavbarLanguage[]
  showDivider?: boolean
}) {
  const { t } = useTranslation()
  const csrfToken = getMeta('ol-csrfToken')
  const redirect = `${window.location.pathname}${window.location.search}`
  const visibleLanguages = selectableLanguages.filter(
    language => language.code && language.name
  )

  if (visibleLanguages.length <= 1) {
    return null
  }

  return (
    <>
      {showDivider ? <NavDropdownDivider /> : null}
      <Dropdown.Item as="li" disabled role="menuitem">
        {t('language')}
      </Dropdown.Item>
      {visibleLanguages.map(language => {
        const isActive = language.code === currentLangCode

        return (
          <DropdownListItem key={language.code}>
            <form method="POST" action="/language">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <input type="hidden" name="language" value={language.code} />
              <input type="hidden" name="redirect" value={redirect} />
              <button
                type="submit"
                className="dropdown-item language-menu-item"
                aria-current={isActive ? 'true' : undefined}
              >
                <span>{language.name}</span>
                {isActive ? (
                  <MaterialIcon
                    className="dropdown-item-trailing-icon"
                    type="check"
                  />
                ) : null}
              </button>
            </form>
          </DropdownListItem>
        )
      })}
    </>
  )
}
