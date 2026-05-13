import { useTranslation } from 'react-i18next'
import NewProjectButton from '../new-project-button'
import SidebarFilters from './sidebar-filters'
import { usePersistedResize } from '@/shared/hooks/use-resize'
import { useScrolled } from '@/features/project-list/components/sidebar/use-scroll'
import { SidebarLowerSection } from '@/shared/components/sidebar/sidebar-lower-section'
import { isSplitTestEnabled } from '@/utils/splitTestUtils'
import { DsNavPageSwitcher } from '@/shared/components/sidebar/ds-nav-page-switcher'
import { useProjectListContext } from '@/features/project-list/context/project-list-context'

function SidebarDsNav() {
  const { t } = useTranslation()
  const isLibraryEnabled = isSplitTestEnabled('superpaper-library')
  const { selectFilter } = useProjectListContext()
  const { mousePos, getHandleProps, getTargetProps } = usePersistedResize({
    name: 'project-sidebar',
  })
  const { containerRef, scrolledUp, scrolledDown } = useScrolled()

  return (
    <div
      className="project-list-sidebar-wrapper-react d-none d-md-flex"
      {...getTargetProps({
        style: {
          ...(mousePos?.x && { flexBasis: `${mousePos.x}px` }),
        },
      })}
    >
      {isLibraryEnabled && (
        <>
          <DsNavPageSwitcher
            activePage="projects"
            showLogo={false}
            onProjectsClick={() => selectFilter('all')}
          />
          <hr className="ds-nav-page-switcher-divider" />
        </>
      )}
      <nav
        className="flex-grow flex-shrink"
        aria-label={t('project_categories_tags')}
      >
        {!isLibraryEnabled && (
          <NewProjectButton
            id="new-project-button-sidebar"
            className={scrolledDown ? 'show-shadow' : undefined}
          />
        )}
        <div
          className="project-list-sidebar-scroll"
          ref={containerRef}
          data-testid="project-list-sidebar-scroll"
        >
          <SidebarFilters />
        </div>
      </nav>
      <div className="ds-nav-sidebar-lower">
        <SidebarLowerSection showThemeToggle />
      </div>
      <div
        {...getHandleProps({
          style: {
            position: 'absolute',
            zIndex: 1,
            top: 0,
            right: '-2px',
            height: '100%',
            width: '4px',
          },
        })}
      />
    </div>
  )
}

export default SidebarDsNav
