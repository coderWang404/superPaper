import { expect } from 'chai'
import { render, screen } from '@testing-library/react'

import IntegrationsPanel from '@/features/integrations-panel/integrations-panel'
import { RailProvider } from '@/features/ide-react/context/rail-context'
import {
  makeProjectProvider,
  projectDefaults,
} from '../../helpers/editor-providers'

describe('<IntegrationsPanel />', function () {
  it('renders an empty state when no integrations are available', function () {
    const ProjectProvider = makeProjectProvider(projectDefaults)

    render(
      <ProjectProvider>
        <RailProvider>
          <IntegrationsPanel />
        </RailProvider>
      </ProjectProvider>
    )

    screen.getByRole('heading', { name: 'Integrations' })
    screen.getByText('No integrations available')
    screen.getByText(
      'Configured integrations will appear here when they are enabled for this deployment.'
    )
    expect(screen.getByRole('status')).to.exist
  })
})
