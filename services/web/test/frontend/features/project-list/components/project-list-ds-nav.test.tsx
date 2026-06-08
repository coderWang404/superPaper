import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import { ProjectListDsNav } from '../../../../../frontend/js/features/project-list/components/project-list-ds-nav'
import { renderWithProjectListContext } from '../helpers/render-with-context'

describe('<ProjectListDsNav />', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-splitTestVariants', {
      'superpaper-library': 'enabled',
    })
    window.metaAttributesCache.set('ol-footer', {
      showThinFooter: false,
      translatedLanguages: { en: 'English' },
      subdomainLang: { en: { lngCode: 'en', url: 'superpaper.com' } },
    })
    window.metaAttributesCache.set('ol-navbar', {
      items: [],
    })
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('renders unique New Project button ids for mobile and desktop library UI', function () {
    renderWithProjectListContext(<ProjectListDsNav />)

    const newProjectButtonIds = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[id^="new-project-button-projects-table"]'
      ),
      element => element.id
    )

    expect(newProjectButtonIds).to.have.length(2)
    expect(new Set(newProjectButtonIds).size).to.equal(
      newProjectButtonIds.length
    )
  })
})
