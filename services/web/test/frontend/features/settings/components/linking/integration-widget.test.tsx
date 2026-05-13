import { expect } from 'chai'
import sinon from 'sinon'
import { screen, fireEvent, render, within } from '@testing-library/react'
import { IntegrationLinkingWidget } from '../../../../../../frontend/js/features/settings/components/linking/integration-widget'
import * as eventTracking from '@/infrastructure/event-tracking'

describe('<IntegrationLinkingWidgetTest/>', function () {
  const defaultProps = {
    id: 'integration-widget-id',
    logo: <div />,
    title: 'Integration',
    description: 'paragraph1',
    helpPath: '/learn',
    linkPath: '/link',
    unlinkPath: '/unlink',
    unlinkConfirmationTitle: 'confirm unlink',
    unlinkConfirmationText: 'you will be unlinked',
  }

  describe('when the integration is not linked', function () {
    let sendMBSpy: sinon.SinonSpy
    beforeEach(function () {
      sendMBSpy = sinon.spy(eventTracking, 'sendMB')
      render(<IntegrationLinkingWidget {...defaultProps} />)
    })

    it('should render a link to initiate integration linking', function () {
      expect(
        screen
          .getByRole('link', { name: 'Link Integration' })
          .getAttribute('href')
      ).to.equal('/link')
    })

    it('should track clicks on the link action', function () {
      fireEvent.click(screen.getByRole('link', { name: 'Link Integration' }))
      expect(sendMBSpy).to.be.calledOnce
      expect(sendMBSpy).calledWith('link-integration-click', {
        integration: 'Integration',
        location: 'Settings',
      })
    })

    afterEach(function () {
      sendMBSpy.restore()
    })
  })

  describe('when the integration is linked', function () {
    beforeEach(function () {
      render(
        <IntegrationLinkingWidget
          {...defaultProps}
          linked
          statusIndicator={<div>status indicator</div>}
        />
      )
    })

    it('should render a status indicator', function () {
      screen.getByText('status indicator')
    })

    it('should display an `unlink` button', function () {
      screen.getByRole('button', { name: 'Unlink Integration' })
    })

    it('should open a modal with a link to confirm integration unlinking', function () {
      fireEvent.click(
        screen.getByRole('button', { name: 'Unlink Integration' })
      )
      const withinModal = within(screen.getByRole('dialog'))
      withinModal.getByText('confirm unlink')
      withinModal.getByText('you will be unlinked')
      withinModal.getByRole('button', { name: 'Cancel' })
      withinModal.getByRole('button', { name: 'Unlink' })
    })

    it('should cancel unlinking when clicking "cancel" in the confirmation modal', async function () {
      fireEvent.click(
        screen.getByRole('button', { name: 'Unlink Integration' })
      )
      screen.getByText('confirm unlink')
      const cancelBtn = screen.getByRole('button', {
        name: 'Cancel',
        hidden: false,
      })
      fireEvent.click(cancelBtn)
      await screen.findByRole('button', { name: 'Cancel', hidden: true })
    })
  })
})
