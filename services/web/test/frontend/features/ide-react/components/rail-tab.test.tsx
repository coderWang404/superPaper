import { expect } from 'chai'
import { render, screen } from '@testing-library/react'

import RailTab from '@/features/ide-react/components/rail/rail-tab'

describe('<RailTab />', function () {
  it('renders shared material symbols for AI rail icons', function () {
    render(
      <div>
        <RailTab icon="smart_toy" title="AI Assistant" open={false} />
        <RailTab icon="tune" title="Agent Settings" open={false} />
      </div>
    )

    expect(
      screen.getByRole('button', { name: 'AI Assistant' }).querySelector(
        '.material-symbols'
      )?.textContent
    ).to.equal('smart_toy')
    expect(
      screen.getByRole('button', { name: 'Agent Settings' }).querySelector(
        '.material-symbols'
      )?.textContent
    ).to.equal('tune')
  })
})
