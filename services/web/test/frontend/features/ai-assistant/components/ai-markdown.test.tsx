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

  it('enables math rendering for LaTeX-heavy assistant answers', function () {
    render(
      <AiMarkdown
        content={[
          'Use inline math \\(E = mc^2\\).',
          '',
          '$$',
          '\\int_0^1 x^2\\,dx',
          '$$',
        ].join('\n')}
      />
    )

    const markdown = document.querySelector('.ai-assistant-markdown')
    expect(markdown?.getAttribute('data-plugins')).to.equal('cjk,math')
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

  it('keeps safe relative links on the current origin', function () {
    render(<AiMarkdown content="[compile logs](/project/123/output.log)" />)

    const link = screen.getByRole('link', { name: 'compile logs' })
    expect(link.getAttribute('href')).to.equal(
      'https://www.test-superpaper.com/project/123/output.log'
    )
  })
})
