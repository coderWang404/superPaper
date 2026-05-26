import { expect } from 'chai'
import { render, screen } from '@testing-library/react'
import sinon from 'sinon'

import ThinFooter from '@/shared/components/footer/thin-footer'

describe('<ThinFooter />', function () {
  afterEach(function () {
    sinon.restore()
  })

  it('uses the current year for the copyright notice', function () {
    sinon.useFakeTimers(new Date('2026-05-21T00:00:00.000Z'))

    render(<ThinFooter leftItems={[]} rightItems={[]} />)

    screen.getByText('© 2026')
    expect(screen.queryByText('© 2025')).to.equal(null)
  })
})
