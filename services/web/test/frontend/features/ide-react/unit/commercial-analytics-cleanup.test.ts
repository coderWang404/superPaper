import { expect } from 'chai'
import fs from 'fs'
import path from 'path'

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  return entries.flatMap(entry => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath)
    }
    if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) {
      return [entryPath]
    }
    return []
  })
}

describe('commercial analytics cleanup', function () {
  it('does not call the removed editing-session analytics endpoint from the frontend', function () {
    const frontendDir = path.resolve(__dirname, '../../../../../frontend/js')
    const matches = collectSourceFiles(frontendDir).flatMap(filePath => {
      const source = fs.readFileSync(filePath, 'utf8')
      return source.includes('/editingSession/') ? [filePath] : []
    })

    expect(matches).to.deep.equal([])
  })
})
