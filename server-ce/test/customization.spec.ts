import { isExcludedBySharding, startWith } from './helpers/config'

describe('Customization', function () {
  if (isExcludedBySharding('CE_CUSTOM_1')) return

  describe('default settings', function () {
    startWith({})

    it('should display the default right footer', function () {
      cy.visit('/')
      cy.findByRole('contentinfo').findByRole('link', {
        name: 'Fork on GitHub!',
      })
    })
  })

  describe('custom settings', function () {
    startWith({
      vars: {
        SUPERPAPER_APP_NAME: 'CUSTOM APP NAME',
        SUPERPAPER_LEFT_FOOTER: JSON.stringify([{ text: 'CUSTOM LEFT FOOTER' }]),
        SUPERPAPER_RIGHT_FOOTER: JSON.stringify([
          { text: 'CUSTOM RIGHT FOOTER' },
        ]),
      },
    })

    it('should display custom name', function () {
      cy.visit('/')
      cy.findByRole('navigation', { name: 'Primary' }).findByText(
        'CUSTOM APP NAME'
      )
    })

    it('should display custom left footer', function () {
      cy.visit('/')
      cy.findByRole('contentinfo').findByText('CUSTOM LEFT FOOTER')
    })
    it('should display custom right footer', function () {
      cy.visit('/')
      cy.findByRole('contentinfo').findByText('CUSTOM RIGHT FOOTER')
    })
  })
})
