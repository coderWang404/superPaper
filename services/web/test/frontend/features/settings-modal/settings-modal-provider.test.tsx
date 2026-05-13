import { render } from '@testing-library/react'
import { expect } from 'chai'
import sinon from 'sinon'
import type { FC, PropsWithChildren } from 'react'
import { SettingsModalProvider } from '@/features/settings/context/settings-modal-context'
import { EditorProviders } from '../../helpers/editor-providers'

const PassthroughProvider: FC<PropsWithChildren> = ({ children }) => (
  <>{children}</>
)

describe('<SettingsModalProvider />', function () {
  afterEach(function () {
    sinon.restore()
  })

  it('does not render optional settings modules when they are unavailable', function () {
    const consoleError = sinon.stub(console, 'error')

    render(
      <EditorProviders
        providers={{
          DetachCompileProvider: PassthroughProvider,
          LocalCompileProvider: PassthroughProvider,
        }}
      >
        <SettingsModalProvider>
          <div>Settings content</div>
        </SettingsModalProvider>
      </EditorProviders>
    )

    expect(consoleError).not.to.have.been.calledWithMatch('type is invalid')
  })
})
