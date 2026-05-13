import AbstractMockApi from './AbstractMockApi.mjs'
import sinon from 'sinon'

class MockV1Api extends AbstractMockApi {
  reset() {
    this.doc_exported = {}
    this.docInfo = {}
    this.existingEmails = []
    this.exportId = null
    this.exportParams = null
    this.syncUserFeatures = sinon.stub()
    this.templates = {}
    this.updateEmail = sinon.stub()
    this.users = {}
    this.v1Id = 1000
  }

  nextV1Id() {
    return this.v1Id++
  }

  setUser(id, user) {
    this.users[id] = user
  }

  getDocInfo(token) {
    return this.docInfo[token] || null
  }

  setDocInfo(token, info) {
    this.docInfo[token] = info
  }

  setExportId(id) {
    this.exportId = id
  }

  getLastExportParams() {
    return this.exportParams
  }

  clearExportParams() {
    this.exportParams = null
  }

  setDocExported(token, info) {
    this.doc_exported[token] = info
  }

  setTemplates(templates) {
    this.templates = templates
  }

  applyRoutes() {
    this.app.post('/api/v1/superpaper/users/:v1_user_id/sync', (req, res) => {
      this.syncUserFeatures(req.params.v1_user_id)
      res.sendStatus(200)
    })

    this.app.post('/api/v1/superpaper/exports', (req, res) => {
      this.exportParams = Object.assign({}, req.body)
      res.json({ exportId: this.exportId })
    })

    this.app.put('/api/v1/superpaper/users/:id/email', (req, res) => {
      const { email } = req.body && req.body.user
      if (this.existingEmails.includes(email)) {
        res.sendStatus(409)
      } else {
        this.updateEmail(parseInt(req.params.id), email)
        res.sendStatus(200)
      }
    })

    this.app.post('/api/v1/superpaper/login', (req, res) => {
      for (const id in this.users) {
        const user = this.users[id]
        if (
          user &&
          user.email === req.body.email &&
          user.password === req.body.password
        ) {
          return res.json({
            email: user.email,
            valid: true,
            user_profile: user.profile,
          })
        }
      }
      res.status(403).json({
        email: req.body.email,
        valid: false,
      })
    })

    this.app.get('/api/v1/superpaper/docs/:token/is_published', (req, res) => {
      return res.json({ allow: true })
    })

    this.app.get(
      '/api/v1/superpaper/users/:user_id/docs/:token/info',
      (req, res) => {
        const info = this.getDocInfo(req.params.token) || {
          exists: false,
          exported: false,
        }
        res.json(info)
      }
    )

    this.app.get('/api/v1/superpaper/docs/:token/info', (req, res) => {
      const info = this.getDocInfo(req.params.token) || {
        exists: false,
        exported: false,
      }
      res.json(info)
    })

    this.app.get(
      '/api/v1/superpaper/docs/read_token/:token/exists',
      (req, res) => {
        res.json({ exists: false })
      }
    )

    this.app.get('/api/v2/templates/:templateId', (req, res) => {
      const template = this.templates[req.params.templateId]
      if (!template) {
        return res.sendStatus(404)
      }
      res.json(template)
    })

    this.app.get(
      '/api/v1/superpaper/fake_route_api_handler_tests',
      (req, res) => {
        const expectedStatus = req.query.expectedStatus
        const expectedBody = req.query.expectedBody
        const statusCode = Number(expectedStatus)
        if (
          !Number.isInteger(statusCode) ||
          statusCode < 100 ||
          statusCode > 599
        ) {
          return res
            .status(500)
            .json({ error: 'Invalid expectedStatus query parameter' })
        }
        return res.status(statusCode).json(JSON.parse(expectedBody))
      }
    )
  }
}

export default MockV1Api

// type hint for the inherited `instance` method
/**
 * @function instance
 * @memberOf MockV1Api
 * @static
 * @returns {MockV1Api}
 */
