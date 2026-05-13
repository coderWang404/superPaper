import { expect } from 'chai'
import UserHelper from './helpers/User.mjs'
import { Project } from '../../../app/src/models/Project.mjs'
import mongodb from 'mongodb-legacy'
import Metrics from './helpers/metrics.mjs'

const ObjectId = mongodb.ObjectId

const User = UserHelper.promises

async function getProjectAccessStats() {
  const hit = await Metrics.promises.sumMetrics(
    s => s.startsWith('project_access_cache') && s.includes('"hit"')
  )
  const miss = await Metrics.promises.sumMetrics(
    s => s.startsWith('project_access_cache') && s.includes('"miss"')
  )
  return { hit, miss }
}

describe('Project CRUD', function () {
  beforeEach(async function () {
    this.user = new User()
    await this.user.login()
    this.projectId = await this.user.createProject('example-project')
  })

  describe('project page', function () {
    const loadProject = async function (user, projectId) {
      const { response, body } = await user.doRequest(
        'GET',
        `/project/${projectId}`
      )
      expect(response.statusCode).to.equal(200)
      return body
    }

    it('should cache the project access', async function () {
      const prev = await getProjectAccessStats()
      await loadProject(this.user, this.projectId)
      expect(await getProjectAccessStats()).to.deep.equal({
        hit: prev.hit + 4,
        miss: prev.miss + 1,
      })
    })
  })

  describe("when project doesn't exist", function () {
    it('should return 404', async function () {
      const { response } = await this.user.doRequest(
        'GET',
        '/project/aaaaaaaaaaaaaaaaaaaaaaaa'
      )
      expect(response.statusCode).to.equal(404)
    })
  })

  describe('when project has malformed id', function () {
    it('should return 404', async function () {
      const { response } = await this.user.doRequest('GET', '/project/blah')
      expect(response.statusCode).to.equal(404)
    })
  })

  describe('when trashing a project', function () {
    it('should mark the project as trashed for the user', async function () {
      const { response } = await this.user.doRequest(
        'POST',
        `/project/${this.projectId}/trash`
      )
      expect(response.statusCode).to.equal(200)

      const trashedProject = await Project.findById(this.projectId).exec()
      expectObjectIdArrayEqual(trashedProject.trashed, [this.user._id])
    })

    it('does nothing if the user has already trashed the project', async function () {
      // Mark as trashed the first time
      await this.user.doRequest('POST', `/project/${this.projectId}/trash`)

      // And then a second time
      await this.user.doRequest('POST', `/project/${this.projectId}/trash`)

      const trashedProject = await Project.findById(this.projectId).exec()
      expectObjectIdArrayEqual(trashedProject.trashed, [this.user._id])
    })

    describe('with an array archived state', function () {
      it('should mark the project as not archived for the user', async function () {
        await Project.updateOne(
          { _id: this.projectId },
          { $set: { archived: [new ObjectId(this.user._id)] } }
        ).exec()

        const { response } = await this.user.doRequest(
          'POST',
          `/project/${this.projectId}/trash`
        )

        expect(response.statusCode).to.equal(200)

        const trashedProject = await Project.findById(this.projectId).exec()
        expectObjectIdArrayEqual(trashedProject.archived, [])
      })
    })
  })

  describe('when untrashing a project', function () {
    it('should mark the project as untrashed for the user', async function () {
      await Project.updateOne(
        { _id: this.projectId },
        { trashed: [new ObjectId(this.user._id)] }
      ).exec()
      const { response } = await this.user.doRequest(
        'DELETE',
        `/project/${this.projectId}/trash`
      )
      expect(response.statusCode).to.equal(200)

      const trashedProject = await Project.findById(this.projectId).exec()
      expectObjectIdArrayEqual(trashedProject.trashed, [])
    })

    it('does nothing if the user has already untrashed the project', async function () {
      await Project.updateOne(
        { _id: this.projectId },
        { trashed: [new ObjectId(this.user._id)] }
      ).exec()
      // Mark as untrashed the first time
      await this.user.doRequest('DELETE', `/project/${this.projectId}/trash`)

      // And then a second time
      await this.user.doRequest('DELETE', `/project/${this.projectId}/trash`)

      const trashedProject = await Project.findById(this.projectId).exec()
      expectObjectIdArrayEqual(trashedProject.trashed, [])
    })

    it('sets trashed to an empty array if not set', async function () {
      await this.user.doRequest('DELETE', `/project/${this.projectId}/trash`)

      const trashedProject = await Project.findById(this.projectId).exec()
      expectObjectIdArrayEqual(trashedProject.trashed, [])
    })
  })

  describe('ProjectAdminSettings', async function () {
    it('publicAccessLevel can be set to private', async function () {
      const { response } = await this.user.doRequest('POST', {
        url: `/project/${this.projectId}/settings/admin`,
        json: {
          publicAccessLevel: 'private',
        },
      })
      expect(response.statusCode).to.equal(204)
      const project = await Project.findById(this.projectId).exec()
      expect(project.publicAccesLevel).to.equal('private')
    })
    it('publicAccessLevel can be set to tokenBased', async function () {
      await this.user.makePrivate(this.projectId)
      const { response } = await this.user.doRequest('POST', {
        url: `/project/${this.projectId}/settings/admin`,
        json: {
          publicAccessLevel: 'tokenBased',
        },
      })
      expect(response.statusCode).to.equal(204)
      const project = await Project.findById(this.projectId).exec()
      expect(project.publicAccesLevel).to.equal('tokenBased')
    })
    it('returns a 400 when publicAccessLevel is an unsupported access level', async function () {
      await this.user.makePrivate(this.projectId)
      const { response, body } = await this.user.doRequest('POST', {
        url: `/project/${this.projectId}/settings/admin`,
        json: {
          publicAccessLevel: 'readOnly',
        },
      })
      expect(response.statusCode).to.equal(400)
      expect(body.details[0].message).to.equal('unexpected access level')
      const project = await Project.findById(this.projectId).exec()
      expect(project.publicAccesLevel).to.equal('private')
    })
    it('returns a 500 when no publicAccessLevel is provided', async function () {
      const { response, body } = await this.user.doRequest('POST', {
        url: `/project/${this.projectId}/settings/admin`,
        json: {},
      })
      expect(response.statusCode).to.equal(500)
      expect(body).to.equal('Internal Server Error')
    })
  })
})

function expectObjectIdArrayEqual(objectIdArray, stringArray) {
  const stringifiedArray = objectIdArray.map(id => id.toString())
  expect(stringifiedArray).to.deep.equal(stringArray)
}
