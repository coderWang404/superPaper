import { expect } from 'vitest'
import { Project } from '../../../../app/src/models/Project.mjs'

describe('Project workspace storage metadata', function () {
  it('defaults projects to the mongo storage backend', function () {
    const project = new Project({ name: 'Paper' })

    expect(project.storageBackend).to.equal('mongo')
    expect(project.workspace.rootPath).to.equal(null)
    expect(project.workspace.migratedAt).to.equal(null)
    expect(project.workspace.finalizedAt).to.equal(null)
  })
})
