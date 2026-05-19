import { expect } from 'chai'
import { render, screen } from '@testing-library/react'

import AiMarkdown from '../../../../../frontend/js/features/ai-assistant/components/ai-markdown'

describe('<AiMarkdown />', function () {
  afterEach(function () {
    document.body.innerHTML = ''
  })

  it('renders common AI Markdown blocks', function () {
    render(
      <AiMarkdown
        content={[
          '## Result',
          '',
          '- **Bold** item',
          '',
          '```tex',
          '\\cite{key}',
          '```',
        ].join('\n')}
      />
    )

    screen.getByRole('heading', { name: 'Result', level: 2 })
    screen.getByText('Bold')
    screen.getByText(/\\cite\{key\}/)
  })

  it('sanitizes dangerous HTML and links', function () {
    render(
      <AiMarkdown
        content={[
          '[safe](https://example.com)',
          '[bad](javascript:alert(1))',
          '<script>alert(1)</script>',
          '<img src=x onerror=alert(1)>',
        ].join('\n\n')}
      />
    )

    const safeLink = screen.getByRole('link', { name: 'safe' })
    expect(safeLink.getAttribute('href')).to.equal('https://example.com/')
    expect(document.querySelector('script')).to.equal(null)
    expect(document.querySelector('[onerror]')).to.equal(null)
    expect(document.querySelector('a[href^="javascript:"]')).to.equal(null)
  })
})
