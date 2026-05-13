import React from 'react'
import LanguagePicker from '../../../../frontend/js/shared/components/language-picker'

describe('LanguagePicker', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-i18n', {
      currentLangCode: 'en',
    })
    window.metaAttributesCache.set('ol-footer', {
      showThinFooter: false,
      translatedLanguages: {
        en: 'English',
        fr: 'Français',
        es: 'Español',
      },
      subdomainLang: {
        en: { lngCode: 'en', url: 'superpaper.com' },
        fr: { lngCode: 'fr', url: 'fr.superpaper.com' },
        es: { lngCode: 'es', url: 'es.superpaper.com' },
      },
    })
  })

  it('renders the language picker with the current language', function () {
    cy.mount(<LanguagePicker showHeader />)
    cy.get('#language-picker-toggle').should('contain', 'English')
  })

  it('opens the dropdown and lists available languages', function () {
    cy.mount(<LanguagePicker showHeader />)
    cy.get('#language-picker-toggle').click()

    cy.get('.dropdown-menu').within(() => {
      cy.contains('English').should('exist')
      cy.contains('Français').should('exist')
      cy.contains('Español').should('exist')
    })
  })

  it('changes the language and updates the URL when a language is selected', function () {
    cy.mount(<LanguagePicker showHeader />)
    cy.get('#language-picker-toggle').should('exist').click()
    cy.contains('Français').click()
    cy.url().should('include', 'fr.superpaper.com')
  })
})
