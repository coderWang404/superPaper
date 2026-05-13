import { useTranslation } from 'react-i18next'
import { BookBookmark, Folder } from '@phosphor-icons/react'
import superPaperLogo from '@/shared/images/superpaper-icon.png'

type ActivePage = 'library' | 'projects'

export function DsNavPageSwitcher({
  activePage,
  showLogo = true,
  onLibraryClick,
  onProjectsClick,
}: {
  activePage: ActivePage
  showLogo?: boolean
  onLibraryClick?: React.MouseEventHandler
  onProjectsClick?: React.MouseEventHandler
  }) {
  const { t } = useTranslation()

  return (
    <>
      {showLogo && (
        <div className="ds-nav-page-switcher-logo">
          <img
            src={superPaperLogo}
            alt="superPaper"
            height="59"
            width="130"
          />
        </div>
      )}
      <ul
        className={`list-unstyled ds-nav-page-switcher-items${!showLogo ? ' ds-nav-page-switcher-items--no-logo' : ''}`}
      >
        <li>
          <a
            href="/library"
            className={`ds-nav-page-switcher-item${activePage === 'library' ? ' active' : ''}`}
            aria-current={activePage === 'library' ? 'page' : undefined}
            onClick={
              onLibraryClick
                ? e => {
                    e.preventDefault()
                    onLibraryClick(e)
                  }
                : undefined
            }
          >
            <BookBookmark size={24} />
            <span>{t('library')}</span>
          </a>
        </li>
        <li>
          <a
            href="/project"
            className={`ds-nav-page-switcher-item${activePage === 'projects' ? ' active' : ''}`}
            aria-current={activePage === 'projects' ? 'page' : undefined}
            onClick={
              onProjectsClick
                ? e => {
                    e.preventDefault()
                    onProjectsClick(e)
                  }
                : undefined
            }
          >
            <Folder size={24} />
            <span>{t('projects')}</span>
          </a>
        </li>
      </ul>
    </>
  )
}
