import { Streamdown, defaultUrlTransform } from 'streamdown'
import { cjk } from '@streamdown/cjk'
import { math } from '@streamdown/math'
import 'katex/dist/katex.min.css'

type AiMarkdownProps = {
  content: string
  streaming?: boolean
}

const ALLOWED_TAGS = {
  kbd: ['className'],
}

function transformUrl(
  url: string,
  key: string,
  node: Parameters<typeof defaultUrlTransform>[2]
) {
  if (key !== 'href') {
    return defaultUrlTransform(url, key, node)
  }

  if (url.startsWith('#')) {
    return url
  }

  try {
    const parsedUrl = new URL(url, window.location.origin)
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.toString()
    }
  } catch {
    return null
  }

  return null
}

export default function AiMarkdown({
  content,
  streaming = false,
}: AiMarkdownProps) {
  return (
    <Streamdown
      allowedTags={ALLOWED_TAGS}
      animated={false}
      className="ai-assistant-markdown"
      controls={false}
      linkSafety={{ enabled: false }}
      mode={streaming ? 'streaming' : 'static'}
      parseIncompleteMarkdown={streaming}
      plugins={{ cjk, math }}
      urlTransform={transformUrl}
    >
      {content}
    </Streamdown>
  )
}
