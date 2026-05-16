import { expect } from 'vitest'
import fs from 'node:fs'
import { parse } from 'acorn'
import { simple as walkSimple } from 'acorn-walk'

function collectWebRoutes() {
  const routerSource = fs.readFileSync('app/src/router.mjs', 'utf8')
  const ast = parse(routerSource, {
    sourceType: 'module',
    ecmaVersion: 2024,
  })
  const routes = []

  walkSimple(ast, {
    CallExpression(node) {
      const callee = node.callee

      if (
        callee?.type !== 'MemberExpression' ||
        callee.object?.name !== 'webRouter'
      ) {
        return
      }

      const method = callee.property?.name
      if (!['get', 'post', 'patch', 'delete'].includes(method)) {
        return
      }

      const [pathArg, ...handlers] = node.arguments
      if (pathArg?.type !== 'Literal') {
        return
      }

      routes.push({
        method,
        path: pathArg.value,
        handlers: handlers.map(summarizeHandler),
      })
    },
  })

  return routes
}

function summarizeHandler(handler) {
  if (handler.type === 'MemberExpression') {
    return summarizeMemberExpression(handler)
  }

  if (handler.type === 'CallExpression') {
    const callee = summarizeMemberExpression(handler.callee)
    if (callee === 'AuthenticationController.requireLogin') {
      return 'AuthenticationController.requireLogin()'
    }
    if (callee === 'RateLimiterMiddleware.rateLimit') {
      return summarizeRateLimitCall(handler)
    }
  }

  return handler.type
}

function summarizeMemberExpression(expression) {
  if (expression?.type !== 'MemberExpression') {
    return null
  }

  const object = expression.object?.name
  const property = expression.property?.name
  return object && property ? `${object}.${property}` : null
}

function summarizeRateLimitCall(expression) {
  const [limiterArg, optionsArg] = expression.arguments
  const limiter = summarizeMemberExpression(limiterArg)
  const params =
    optionsArg?.type === 'ObjectExpression'
      ? optionsArg.properties.find(property => property.key?.name === 'params')
          ?.value
      : null

  if (limiter === 'rateLimiters.projectAiChat' && isProjectIdParams(params)) {
    return "RateLimiterMiddleware.rateLimit(rateLimiters.projectAiChat,{params:['Project_id']})"
  }

  return `RateLimiterMiddleware.rateLimit(${limiter ?? 'unknown'})`
}

function isProjectIdParams(node) {
  return (
    node?.type === 'ArrayExpression' &&
    node.elements.length === 1 &&
    node.elements[0]?.value === 'Project_id'
  )
}

function findRoute(method, path) {
  return collectWebRoutes().find(
    route => route.method === method && route.path === path
  )
}

describe('AiAgent routes', function () {
  it('mounts the agent config endpoint behind login and project read access', function () {
    const route = findRoute('get', '/project/:Project_id/ai/agent/config')

    expect(route).to.exist
    expect(route.handlers).to.include('AuthenticationController.requireLogin()')
    expect(route.handlers).to.include(
      'AuthorizationMiddleware.ensureUserCanReadProject'
    )
    expect(route.handlers).to.include('AiAgentSettingsController.projectConfig')
  })

  it('mounts the project agent settings endpoint behind project admin access', function () {
    const route = findRoute('patch', '/project/:Project_id/ai/agent/settings')

    expect(route).to.exist
    expect(route.handlers).to.include('AuthenticationController.requireLogin()')
    expect(route.handlers).to.include(
      'AuthorizationMiddleware.ensureUserCanAdminProject'
    )
    expect(route.handlers).to.include(
      'AiAgentSettingsController.updateProjectSettings'
    )
  })

  it('mounts global agent settings endpoints behind site admin access', function () {
    const configRoute = findRoute('get', '/admin/ai/agent/config')
    const settingsRoute = findRoute('patch', '/admin/ai/agent/settings')

    expect(configRoute).to.exist
    expect(configRoute.handlers).to.include(
      'AuthorizationMiddleware.ensureUserIsSiteAdmin'
    )
    expect(configRoute.handlers).to.include(
      'AiAgentSettingsController.globalConfig'
    )
    expect(settingsRoute).to.exist
    expect(settingsRoute.handlers).to.include(
      'AuthorizationMiddleware.ensureUserIsSiteAdmin'
    )
    expect(settingsRoute.handlers).to.include(
      'AiAgentSettingsController.updateGlobalSettings'
    )
  })

  it('mounts the agent session endpoint behind login, rate limit, and project read access', function () {
    const route = findRoute('post', '/project/:Project_id/ai/agent/sessions')

    expect(route).to.exist
    expect(route.handlers).to.include('AuthenticationController.requireLogin()')
    expect(route.handlers).to.include(
      "RateLimiterMiddleware.rateLimit(rateLimiters.projectAiChat,{params:['Project_id']})"
    )
    expect(route.handlers).to.include(
      'AuthorizationMiddleware.ensureUserCanReadProject'
    )
    expect(route.handlers).to.include('AiAgentController.createSession')
  })

  it('mounts the agent turn endpoint behind login, rate limit, and project read access', function () {
    const route = findRoute(
      'post',
      '/project/:Project_id/ai/agent/sessions/:sessionId/turns'
    )

    expect(route).to.exist
    expect(route.handlers).to.include('AuthenticationController.requireLogin()')
    expect(route.handlers).to.include(
      "RateLimiterMiddleware.rateLimit(rateLimiters.projectAiChat,{params:['Project_id']})"
    )
    expect(route.handlers).to.include(
      'AuthorizationMiddleware.ensureUserCanReadProject'
    )
    expect(route.handlers).to.include('AiAgentController.turnStream')
  })

  it('mounts the start act endpoint behind login, rate limit, and project write access', function () {
    const route = findRoute(
      'post',
      '/project/:Project_id/ai/agent/sessions/:sessionId/start-act'
    )

    expect(route).to.exist
    expect(route.handlers).to.include('AuthenticationController.requireLogin()')
    expect(route.handlers).to.include(
      "RateLimiterMiddleware.rateLimit(rateLimiters.projectAiChat,{params:['Project_id']})"
    )
    expect(route.handlers).to.include(
      'AuthorizationMiddleware.ensureUserCanWriteProjectContent'
    )
    expect(route.handlers).to.include('AiAgentController.startAct')
  })

  it('mounts the patch apply endpoint behind login, rate limit, and project write access', function () {
    const route = findRoute(
      'post',
      '/project/:Project_id/ai/agent/patches/:patchId/apply'
    )

    expect(route).to.exist
    expect(route.handlers).to.include('AuthenticationController.requireLogin()')
    expect(route.handlers).to.include(
      "RateLimiterMiddleware.rateLimit(rateLimiters.projectAiChat,{params:['Project_id']})"
    )
    expect(route.handlers).to.include(
      'AuthorizationMiddleware.ensureUserCanWriteProjectContent'
    )
    expect(route.handlers).to.include('AiAgentController.applyPatch')
  })

  it('mounts the patch reject endpoint behind login, rate limit, and project write access', function () {
    const route = findRoute(
      'post',
      '/project/:Project_id/ai/agent/patches/:patchId/reject'
    )

    expect(route).to.exist
    expect(route.handlers).to.include('AuthenticationController.requireLogin()')
    expect(route.handlers).to.include(
      "RateLimiterMiddleware.rateLimit(rateLimiters.projectAiChat,{params:['Project_id']})"
    )
    expect(route.handlers).to.include(
      'AuthorizationMiddleware.ensureUserCanWriteProjectContent'
    )
    expect(route.handlers).to.include('AiAgentController.rejectPatch')
  })
})
