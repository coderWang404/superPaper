# Agent 模式下一阶段实施计划

## 目标

本阶段继续沿用 `2026-05-16-agent-mode-design.md`，把 Agent 从“能执行单轮工具并生成审批补丁”推进到“具备明确 Plan/Act 生命周期、后端强制权限边界、可配置 skills/plugins、可审计设置”的生产形态。

不做临时兼容方案，不把安全能力只写进 prompt。所有约束都必须落在后端状态机、工具注册表、权限策略和审计事件里。

## 设计决策

### Plan/Act 状态机

Agent 会话保留 `mode: plan | act`，但含义从展示字段升级为后端状态机：

- `plan`：模型只能生成计划、调用只读工具、触发受控编译，不允许 `patch.propose`。
- `act`：用户显式点击 Start Act 后，后端把会话推进到执行模式，才允许写入类提案工具。
- `waiting_for_act`：计划生成后等待用户确认执行。
- `waiting_for_approval`：已生成待审批 patch，等待用户批准或拒绝。

Act 不是前端自我约束。`AiAgentRuntime` 必须在执行工具前按会话模式和权限 profile 校验工具。

### 权限策略

新增 `AiAgentPermissionManager`，统一决定工具行为：

- 工具元数据声明 `access`、`requiresApproval`、`riskLevel`、`category`。
- 默认 profile 为 `project-agent-default`。
- 只读工具允许自动执行。
- `compile.run` 允许自动执行但保持项目 AI rate limit。
- `patch.propose` 只允许在 `act` 模式执行。
- 外部网络、shell、browser、git、MCP 继续禁用，不能出现在可用工具里。

后续管理员配置会保存为 profile，但第一步先把 profile 设计成可持久化模型和 API 返回结构，避免把策略散落在 runtime 中。

### Skills 和 Plugins 配置

第一阶段已有内置 skills/plugins。本阶段补：

- 后端配置模型：`AgentSkillSetting`、`AgentPluginSetting`。
- 配置读取层：内置项 + 管理员/项目启用状态合并。
- 前端 Agent 摘要显示 enabled/disabled，而不是只显示数量。
- 模型上下文只加载启用的 skill。

插件仍是只读 manifest，不允许脚本、MCP server、hook 执行代码。这个约束由 schema 校验和 manager 实现强制。

### 审计

新增事件类型：

- `mode_changed`
- `permission_denied`
- `settings_changed`

所有模式切换、工具拒绝、配置变更都写入 `AgentEvent` 或对应设置更新时间字段。事件 payload 继续走脱敏。

## 实施步骤

1. 更新设计文档与实施计划并提交。
2. 新增 `AiAgentPermissionManager`，让 runtime 在工具调用前强制校验模式和工具策略。
3. 实现 Plan/Act：创建 session 默认为 plan，plan turn 完成后进入 `waiting_for_act`，新增 start-act API。
4. 前端 Agent 面板增加 Plan/Act 流程：先 Plan，再 Start Act，再 Run。
5. 新增 settings 模型和 manager，返回 enabled skills/plugins，并让 runtime 只加载启用 skills。
6. 增加只读管理员/项目配置 API 的最小后端面，后续再接完整管理 UI。
7. 重建 Docker 镜像，运行后端 Agent 单测、前端 AI 面板测试，检查公网入口。

## 验收标准

- 在 plan 模式下，即使模型请求 `patch.propose`，后端也拒绝并记录 `permission_denied`。
- 用户点击 Start Act 前，Agent 不会创建 patch。
- Start Act 后，同一个 session 可以执行 `patch.propose` 并进入人工审批。
- Agent 配置 API 能返回工具权限 profile、启用 skill、启用 plugin。
- 所有新增 API 有路由测试或 controller/runtime 单测。
- 前端可以清楚展示当前 mode 和下一步动作。
