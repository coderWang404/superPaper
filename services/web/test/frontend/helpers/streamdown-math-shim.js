module.exports = {
  math: {
    name: 'katex',
    type: 'math',
    remarkPlugin: [],
    rehypePlugin: [],
    getStyles() {
      return 'katex/dist/katex.min.css'
    },
  },
}
