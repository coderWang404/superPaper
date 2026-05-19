const React = require('react')
const { micromark } = require('micromark')
const DOMPurify = require('dompurify')
const PropTypes = require('prop-types')

function defaultUrlTransform(url) {
  if (/^(?:https?:|mailto:|#)/i.test(url)) {
    return url
  }
  return null
}

function Streamdown({ children, className, urlTransform = defaultUrlTransform }) {
  const html = React.useMemo(() => {
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      if (node.nodeName === 'A') {
        const href = node.getAttribute('href')
        const nextHref = href ? urlTransform(href, 'href', node) : null
        if (nextHref) {
          node.setAttribute('href', nextHref)
          node.setAttribute('rel', 'noreferrer')
          node.setAttribute('target', '_blank')
        } else {
          node.removeAttribute('href')
        }
      }
    })

    try {
      return DOMPurify.sanitize(micromark(String(children || '')))
    } finally {
      DOMPurify.removeHook('afterSanitizeAttributes')
    }
  }, [children, urlTransform])

  return React.createElement('div', {
    className,
    dangerouslySetInnerHTML: { __html: html },
  })
}

Streamdown.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  urlTransform: PropTypes.func,
}

module.exports = {
  Streamdown,
  defaultUrlTransform,
}
