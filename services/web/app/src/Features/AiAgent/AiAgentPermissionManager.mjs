const DEFAULT_PERMISSION_PROFILE = {
  id: 'project-agent-default',
  writeToolsRequireApproval: true,
  externalToolsEnabled: false,
  actRequiredForWriteTools: true,
}

const TOOL_RULES = new Map([
  [
    'project.list_files',
    {
      access: 'read',
      requiresApproval: false,
      category: 'project',
      riskLevel: 'low',
      allowedModes: ['plan', 'act'],
    },
  ],
  [
    'project.read_file',
    {
      access: 'read',
      requiresApproval: false,
      category: 'project',
      riskLevel: 'low',
      allowedModes: ['plan', 'act'],
    },
  ],
  [
    'project.search',
    {
      access: 'read',
      requiresApproval: false,
      category: 'project',
      riskLevel: 'low',
      allowedModes: ['plan', 'act'],
    },
  ],
  [
    'project.get_map',
    {
      access: 'read',
      requiresApproval: false,
      category: 'project',
      riskLevel: 'low',
      allowedModes: ['plan', 'act'],
    },
  ],
  [
    'editor.get_selection',
    {
      access: 'read',
      requiresApproval: false,
      category: 'editor',
      riskLevel: 'low',
      allowedModes: ['plan', 'act'],
    },
  ],
  [
    'compile.get_last_result',
    {
      access: 'read',
      requiresApproval: false,
      category: 'compile',
      riskLevel: 'low',
      allowedModes: ['plan', 'act'],
    },
  ],
  [
    'compile.run',
    {
      access: 'read',
      requiresApproval: false,
      category: 'compile',
      riskLevel: 'medium',
      allowedModes: ['plan', 'act'],
    },
  ],
  [
    'patch.propose',
    {
      access: 'write',
      requiresApproval: true,
      category: 'patch',
      riskLevel: 'medium',
      allowedModes: ['act'],
    },
  ],
])

export function getDefaultPermissionProfile() {
  return { ...DEFAULT_PERMISSION_PROFILE }
}

export function listToolPolicyDefinitions() {
  return Array.from(TOOL_RULES.entries()).map(([name, rule]) => ({
    name,
    ...rule,
  }))
}

export function isToolAllowed({
  toolName,
  mode,
  permissionProfile = DEFAULT_PERMISSION_PROFILE,
}) {
  const rule = TOOL_RULES.get(toolName)
  if (!rule) {
    return {
      allowed: false,
      reason: 'AGENT_TOOL_NOT_ALLOWED',
      message: 'Agent tool is not allowed',
    }
  }

  if (!rule.allowedModes.includes(mode)) {
    return {
      allowed: false,
      reason: 'AGENT_MODE_NOT_ALLOWED',
      message: 'Agent tool is not allowed in the current mode',
    }
  }

  if (rule.access === 'write' && permissionProfile.actRequiredForWriteTools !== true) {
    return {
      allowed: false,
      reason: 'AGENT_PERMISSION_DENIED',
      message: 'Write tools require approval',
    }
  }

  return {
    allowed: true,
    rule,
  }
}
