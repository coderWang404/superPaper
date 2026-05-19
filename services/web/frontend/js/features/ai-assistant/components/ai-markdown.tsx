import { Streamdown, defaultUrlTransform } from 'streamdown'
import { cjk } from '@streamdown/cjk'

type AiMarkdownProps = {
  content: string
  streaming?: boolean
}

const ALLOWED_TAGS = {
  kbd: ['className'],
}

function transformUrl(url: string, key: string, node: Parameters<typeof defaultUrlTransform>[2]) {
  const transformedUrl = defaultUrlTransform(url, key, node)
  if (!transformedUrl) {
    return transformedUrl
  }

  if (key !== 'href') {
    return transformedUrl
  }

  if (transformedUrl.startsWith('#')) {
    return transformedUrl
  }

  try {
    const parsedUrl = new URL(transformedUrl, window.location.origin)
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
      plugins={{ cjk }}
      urlTransform={transformUrl}
    >
      {content}
    </Streamdown>
  )
}
