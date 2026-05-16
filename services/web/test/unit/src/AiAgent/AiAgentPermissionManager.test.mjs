import { expect } from 'vitest'

import {
  getDefaultPermissionProfile,
  isToolAllowed,
  listToolPolicyDefinitions,
} from '../../../../app/src/Features/AiAgent/AiAgentPermissionManager.mjs'

describe('AiAgentPermissionManager', function () {
  it('exposes the default permission profile', function () {
    expect(getDefaultPermissionProfile()).to.deep.equal({
      id: 'project-agent-default',
      writeToolsRequireApproval: true,
      externalToolsEnabled: false,
      actRequiredForWriteTools: true,
    })
  })

  it('allows read tools in plan mode', function () {
    expect(
      isToolAllowed({
        toolName: 'project.read_file',
        mode: 'plan',
      })
    ).to.include({ allowed: true })
  })

  it('denies patch proposals in plan mode', function () {
    expect(
      isToolAllowed({
        toolName: 'patch.propose',
        mode: 'plan',
      })
    ).to.deep.include({
      allowed: false,
      reason: 'AGENT_MODE_NOT_ALLOWED',
    })
  })

  it('allows patch proposals in act mode', function () {
    expect(
      isToolAllowed({
        toolName: 'patch.propose',
        mode: 'act',
      })
    ).to.include({ allowed: true })
  })

  it('lists tool policy metadata for the client summary', function () {
    expect(listToolPolicyDefinitions()).to.deep.include({
      name: 'patch.propose',
      access: 'write',
      requiresApproval: true,
      category: 'patch',
      riskLevel: 'medium',
      allowedModes: ['act'],
    })
  })
})
