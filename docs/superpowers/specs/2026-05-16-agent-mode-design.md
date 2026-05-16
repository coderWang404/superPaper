# superPaper Agent 模式设计规格

## 目标

在现有 superPaper AI Assistant 基础上增加一套第一方 Agent 模式，使其具备 Claude Code、Codex CLI、Gemini CLI、Cline、OpenHands、aider 这类编码 agent 的核心能力，但必须服务于 superPaper 的多人 LaTeX 编辑场景，而不是把服务器文件系统直接暴露给模型。

第一阶段目标是做出可审计、可审批、可回滚的项目级 agent：

- 能读取项目文件、当前选择区、编译日志和项目元数据。
- 能提出多文件补丁、创建文件、重命名文件、删除文件等建议。
- 能通过用户审批后，沿用现有编辑器、文档更新、历史记录和实时协作流程应用变更。
- 能运行受控的只读或有限写入工具，例如搜索、读取文件、生成 diff、触发编译、读取编译结果。
- 能加载全局和项目级指令，类似 `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`。
- 能预装、启用、禁用 skills 和 plugins，并为后续 MCP 或本地工具扩展保留接口。
- 能保留完整事件流和审计记录，避免模型绕过权限、绕过协作路径或直接写 MongoDB/docstore。

## 外部调研结论

### OpenAI Codex CLI

Codex CLI 是本地运行的开源编码 agent，核心模式是本地工作区、工具调用、sandbox、审批策略和 `AGENTS.md` 指令发现。官方配置把 `approval_policy` 和 `sandbox_mode` 作为核心安全旋钮，支持 `read-only`、`workspace-write`、`danger-full-access` 等模式，并允许细粒度审批项。Codex 的 `AGENTS.md` 发现机制采用全局文件、项目根到当前目录的层级合并，越靠近当前目录的指令越后出现，因而优先级更高。Codex 也支持 MCP client/server 形态，说明 agent runtime 和外部工具协议应分层。

对 superPaper 的启发：

- 指令系统要分全局、项目、目录/文件作用域，并有大小限制和合并顺序。
- 工具权限要从一开始建模，不能只靠 prompt 说“不要做”。
- 审批策略、sandbox 策略和模型请求是三个不同层次，不能混在一起。
- 非交互任务和交互任务都需要同一套事件流。

### Claude Code

Claude Code 的扩展体系清晰分层：`CLAUDE.md` 是每次会话自动加载的持久上下文；skills 是按需加载的知识和工作流；MCP 提供外部工具；subagents 用独立上下文处理子任务；hooks 在生命周期事件上确定性执行；plugins 则把 skills、agents、hooks、MCP server、LSP server 等打包分发。Claude Code 工具参考中列出了文件读取、编辑、搜索、shell、web、subagent、任务列表等基础能力，并通过 allow/ask/deny 权限规则控制工具。官方文档特别强调：如果规则必须强制执行，要放在 hook 或权限系统里，不能只写进指令文件。

对 superPaper 的启发：

- Agent 模式应拆成“上下文、工具、技能、插件、审批、审计”六个独立子系统。
- skills 适合保存 LaTeX 修复、论文润色、引用管理、审稿回复、编译错误诊断等工作流。
- plugins 适合打包可复用能力，例如“arXiv 投稿检查包”“学校论文模板包”“Git 同步包”。
- hooks 适合强制策略，例如禁止读取密钥、补丁应用后自动编译、变更前后记录审计。
- subagent 是后续能力，不应阻塞第一阶段，但数据模型要预留。

### Google Gemini CLI

Gemini CLI 是开源命令行 agent，内置文件操作、shell、web fetch/search 和 Google Search grounding，并支持 MCP。其工具文档明确：修改文件或执行 shell 这类 mutator 默认需要用户确认，CLI 会展示 diff 或命令供用户确认。Gemini 的配置支持用户、项目、系统等多层 `settings.json`，支持 `GEMINI.md` 或自定义 `contextFileName` 作为上下文文件，还支持 `coreTools`、`excludeTools`、MCP allow/exclude、sandbox、trusted folders 等。

对 superPaper 的启发：

- 项目内指令文件名不必只支持一个，应支持 `AGENTS.md`、`SUPERPAPER_AGENTS.md` 等可配置候选。
- 只读工具可以默认自动执行；写入、删除、重命名、网络访问、外部命令必须进入审批。
- 工具 allowlist 比 denylist 更适合作为安全边界；denylist 可作为补充。
- 文件发现应默认尊重忽略规则和项目边界，不能把服务器目录当工作区。

### OpenHands

OpenHands 的 runtime 文档把 agent 与外部环境交互抽象为 Runtime：接收 action，执行 bash、文件读写、浏览器、插件等操作，再把 observation 写回事件流。默认 Docker runtime 通过容器隔离执行动作，Local runtime 明确标注没有隔离风险。OpenHands 还把运行时实现拆成 Docker、Remote、Modal、Runloop 等多种后端。

对 superPaper 的启发：

- superPaper 应引入 `AgentRuntime` 抽象，而不是把工具实现散落在 controller 中。
- 工具执行必须产生结构化 observation，并记录到 agent session。
- 第一阶段可以先做 Web 内部 runtime；将来若开放 shell/MCP，应接入独立容器 runtime。
- 事件流是产品能力，也是审计能力，应作为核心协议设计。

### aider

aider 的强项是代码库上下文选择、repo map、diff 编辑和自动 lint/test。它会把仓库中重要类、函数、签名压缩成 repo map，并按 token budget 选择最相关片段；每次 AI 编辑后可自动 lint/test 并尝试修复错误；编码规范可通过只读文件加载进上下文。

对 superPaper 的启发：

- LaTeX 项目也需要“项目地图”：根文档、章节文件、bib 文件、cls/sty、图片引用、引用键、label/ref、输入依赖关系。
- Agent 不应每次塞全量项目文件，而应有预算化上下文选择。
- 补丁应用后应自动触发编译，并把编译错误作为下一轮 observation。
- 审批 UI 应显示 diff，不应只显示模型自然语言。

### Cline

Cline 是开源 IDE/CLI agent，强调 Plan/Act 模式、人机审批、多文件 diff、终端命令、检查点、rules/skills、MCP、plugins、多 agent team 和 headless CI。它的 README 明确：每个编辑在 IDE 中显示为可审阅、可修改、可回滚的 diff；Plan 模式先探索和制定策略，Act 模式才执行；auto-approve 是可选能力。

对 superPaper 的启发：

- superPaper Agent 面板应区分“计划”和“执行”，默认先产出计划。
- 每个写操作都应可审阅、可撤销，并落入项目历史。
- 检查点可以映射到 superPaper 的历史版本和一次 agent run 的变更集。
- 自动应用必须是管理员显式开启，并且每个项目/用户可关闭。

## 现有 superPaper 基线

当前代码已经具备 Agent 模式的前置基础：

- AI Provider 存储在 `AiProvider` 集合，API Key 加密保存。
- 项目 AI 已有只读聊天接口：`/project/:Project_id/ai/config`、`/project/:Project_id/ai/chat`、`/project/:Project_id/ai/chat/stream`。
- `AiProjectContextBuilder` 已能读取 `.tex`、`.bib`、`.cls`、`.sty` 并做字符预算。
- 前端 AI rail 已有 `Chat` / `Agent` 切换，但 Agent 仍是 placeholder。
- 文档写入已有 `DocumentUpdaterHandler.setDocument`、`EditorController`、`EditorHttpController`、`ProjectEntityUpdateHandler` 等路径。
- 文件创建、删除、重命名、移动已有 Editor HTTP 路由和权限中间件。
- 编译流程已有 `CompileController`、`CompileManager`、CLSI、PDF/日志输出路径。
- 权限中间件已有 `ensureUserCanReadProject`、`ensureUserCanWriteProjectContent`。

关键约束：

- 模型不能直接写 MongoDB、docstore、Redis 或 filestore。
- 模型不能拿到 provider API key、cookie、session、CSRF token、环境变量。
- Agent 写入必须经过用户审批，并通过现有文档/文件更新路径。
- 多人协作时不能绕过 real-time/document-updater 的同步语义。
- Git、历史、编译、文件树、协作、管理员功能必须保持可用。

## 非目标

第一阶段不做这些：

- 不做真实服务器 shell 执行。
- 不做任意公网浏览器控制。
- 不做后台无人值守自动改项目。
- 不做模型直接推送 Git。
- 不做第三方 SaaS agent shell。
- 不做向量数据库依赖。
- 不做用户 API Key 下发到浏览器。
- 不做跨项目读取。
- 不做商业计费、订阅、SaaS 分析。

## 核心产品形态

Agent 模式仍位于现有 AI Assistant 左侧 rail 中：

- `Chat`：当前只读问答，继续保留。
- `Agent`：任务式工作流，包含计划、工具事件、补丁预览、审批、应用、编译验证。

Agent 面板的用户流程：

1. 用户输入任务，例如“修复当前编译错误”“把摘要改成学术英文”“拆分 introduction 章节”。
2. Agent 创建一个 `AgentSession`，加载全局/项目指令、项目地图、当前选择、编译日志。
3. Agent 先输出计划，列出预计读取的文件和可能修改的文件。
4. 用户点击“开始执行”。
5. Agent 通过工具读取文件、搜索、生成补丁、请求编译日志。
6. 对任何写入类工具，后端只生成 `pending_patch`，前端显示 diff。
7. 用户逐文件或一次性批准。
8. 后端通过现有编辑/文档更新路径应用补丁。
9. 系统触发编译，读取结果，作为 observation 返回。
10. Agent 给出最终总结：已改文件、验证结果、仍需人工处理的问题。

## 架构设计

### 模块边界

新增 `services/web/app/src/Features/AiAgent`，避免继续膨胀 `AiAssistant`：

- `AiAgentController.mjs`：HTTP/stream controller。
- `AiAgentSessionManager.mjs`：创建 session、推进 turn、结束 session。
- `AiAgentRuntime.mjs`：agent loop 和工具调度。
- `AiAgentToolRegistry.mjs`：工具注册、schema、权限元数据。
- `AiAgentPermissionManager.mjs`：allow/ask/deny、自动审批策略、项目权限映射。
- `AiAgentInstructionLoader.mjs`：全局/项目/目录级指令加载。
- `AiAgentSkillManager.mjs`：skills 发现、启用、加载和预算控制。
- `AiAgentPluginManager.mjs`：plugins 发现、启用、版本和组件注册。
- `AiAgentPatchManager.mjs`：统一 diff 生成、校验、应用、冲突检测。
- `AiAgentContextBuilder.mjs`：项目地图和上下文预算。
- `AiAgentAuditLogger.mjs`：事件审计和密钥脱敏。

前端新增：

- `services/web/frontend/js/features/ai-agent/api.ts`
- `services/web/frontend/js/features/ai-agent/components/agent-panel.tsx`
- `services/web/frontend/js/features/ai-agent/components/tool-event-list.tsx`
- `services/web/frontend/js/features/ai-agent/components/patch-review.tsx`
- `services/web/frontend/js/features/ai-agent/components/agent-settings-summary.tsx`

### Runtime 分层

第一阶段 runtime 不执行 OS shell，只执行 superPaper 内部工具：

```text
浏览器 Agent 面板
  -> AiAgentController
  -> AiAgentSessionManager
  -> AiAgentRuntime
  -> ToolRegistry + PermissionManager
  -> 内部工具
      - 项目文件读取
      - 项目文件搜索
      - 项目地图
      - 编译触发
      - 编译日志读取
      - 补丁生成/预览
      - 补丁应用
  -> DocumentUpdater / EditorController / CompileManager
```

后续阶段可增加隔离 runtime：

```text
AiAgentRuntime
  -> InternalRuntime
  -> ContainerRuntime
  -> MCPRuntime
```

## 数据模型

### `AgentSession`

集合：`agentSessions`

字段：

- `projectId`
- `userId`
- `status`: `planning`、`waiting_for_approval`、`running`、`completed`、`failed`、`cancelled`
- `mode`: `plan`、`act`
- `providerId`
- `model`
- `task`
- `instructionSources`: 已加载的全局/项目/目录指令文件列表和 hash。
- `enabledSkillIds`
- `enabledPluginIds`
- `permissionProfileId`
- `createdAt`
- `updatedAt`
- `completedAt`

### `AgentEvent`

集合：`agentEvents`

字段：

- `sessionId`
- `projectId`
- `userId`
- `sequence`
- `type`: `message`、`tool_call`、`tool_result`、`approval_request`、`approval_response`、`patch_created`、`patch_applied`、`compile_started`、`compile_result`、`error`
- `payload`: 结构化 JSON，必须脱敏。
- `redactionVersion`
- `createdAt`

### `AgentPatch`

集合：`agentPatches`

字段：

- `sessionId`
- `projectId`
- `createdByUserId`
- `status`: `pending`、`approved`、`applied`、`rejected`、`conflicted`
- `baseRevision`: 每个 doc 的版本或 hash。
- `operations`: 多文件操作列表。
- `summary`
- `riskLevel`: `low`、`medium`、`high`
- `createdAt`
- `appliedAt`

操作类型：

- `replace_text`
- `create_doc`
- `delete_doc`
- `rename_entity`
- `move_entity`
- `update_binary_file` 第一阶段不启用

### `AgentInstructionProfile`

集合：`agentInstructionProfiles`

字段：

- `scope`: `global`、`project`
- `projectId`
- `name`
- `content`
- `enabled`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

说明：

- 全局指令由 site admin 管理。
- 项目指令可由项目 owner 或有设置权限的用户管理。
- 文件型指令从项目内文档读取，只读注入，不单独保存副本，事件里只保存 hash 和路径。

### `AgentSkill`

集合：`agentSkills`

字段：

- `name`
- `displayName`
- `description`
- `scope`: `builtin`、`global`、`project`、`plugin`
- `projectId`
- `pluginId`
- `content`
- `enabled`
- `modelInvocable`
- `requiredTools`
- `createdAt`
- `updatedAt`

### `AgentPlugin`

集合：`agentPlugins`

字段：

- `name`
- `version`
- `description`
- `scope`: `builtin`、`global`、`project`
- `enabled`
- `manifest`
- `skills`
- `toolDefinitions`
- `hooks`
- `mcpServers` 后续阶段启用
- `createdAt`
- `updatedAt`

第一阶段 plugin 不允许携带可执行脚本，只允许打包 skills、指令模板和内部工具 preset。

## 指令加载设计

加载顺序：

1. 系统内置 agent 安全指令。
2. 管理员全局指令。
3. 项目设置中的 agent 指令。
4. 项目文件中的 `AGENTS.md`、`SUPERPAPER_AGENTS.md`。
5. 与当前文件路径最接近的目录级指令。
6. 用户当前任务提示。

规则：

- 每个层级记录来源、hash、字节数。
- 默认总预算 32 KiB，可由管理员调整。
- 越接近当前文件的指令越靠后注入。
- 冲突处理原则写入系统指令：安全和权限高于项目偏好；更近的项目指令高于更远指令。
- 指令文件内容视为不可信项目内容，不可授予额外权限。

## 内置工具规格

### 只读工具

默认可自动执行，但仍记录审计事件。

- `project.list_files`
  - 输入：`pathPrefix?`、`extensions?`
  - 输出：文件树摘要。
- `project.read_file`
  - 输入：`path`、`maxChars?`
  - 输出：文本内容、docId、版本/hash。
- `project.search`
  - 输入：`query`、`extensions?`、`maxResults?`
  - 输出：匹配路径、行号、上下文片段。
- `project.get_map`
  - 输入：`maxTokens?`
  - 输出：项目地图，包括 root doc、input/include 图、bib keys、labels、refs。
- `editor.get_selection`
  - 输入：无。
  - 输出：当前用户选择区。
- `compile.get_last_result`
  - 输入：无。
  - 输出：最近编译状态、错误摘要、警告摘要。
- `history.get_recent_changes`
  - 输入：`limit?`
  - 输出：最近项目变更摘要。

### 需审批工具

模型调用后只生成审批请求，用户批准前不产生写入。

- `patch.propose`
  - 输入：多文件补丁。
  - 输出：标准化 `AgentPatch` 和 diff。
- `patch.apply`
  - 输入：`patchId`、批准范围。
  - 权限：`ensureUserCanWriteProjectContent`。
  - 执行：调用 `DocumentUpdaterHandler` / `EditorController`。
- `project.create_doc`
  - 第一阶段可由 `patch.apply` 间接执行，不直接暴露给模型。
- `project.rename_entity`
  - 第一阶段可由 `patch.apply` 间接执行。
- `compile.run`
  - 输入：编译选项。
  - 权限：读项目即可触发普通编译，但需 rate limit。

### 第一阶段禁用工具

- `shell.exec`
- `network.fetch`
- `browser.use`
- `git.commit`
- `git.push`
- `mcp.call_tool`
- `binary.write`

这些工具后续只能在独立 sandbox runtime、权限 allowlist、审计、管理员开关全部存在后启用。

## 权限和审批

权限策略分三层：

1. 项目权限：复用 `ensureUserCanReadProject`、`ensureUserCanWriteProjectContent`。
2. 工具权限：每个工具声明 `read`、`write`、`destructive`、`external`、`requiresApproval`。
3. 管理员策略：全局 allow/ask/deny，默认 deny 外部网络和 shell。

默认策略：

- 只读项目工具：自动允许。
- 补丁生成：自动允许。
- 补丁应用：总是询问。
- 删除文件、重命名、移动：总是询问，UI 单独标红。
- 编译：自动允许，但 rate limit。
- 外部网络、shell、MCP：禁用。

审批记录必须保存：

- 谁批准。
- 批准了哪些文件和操作。
- 批准时的 diff hash。
- 应用结果和冲突结果。

## 补丁应用策略

Agent 写入永远走补丁流程。

补丁格式：

```json
{
  "summary": "修复 citation 和拼写问题",
  "operations": [
    {
      "type": "replace_text",
      "path": "/main.tex",
      "baseHash": "sha256...",
      "oldText": "...",
      "newText": "..."
    }
  ]
}
```

校验规则：

- `path` 必须属于当前项目。
- 文档必须仍匹配 `baseHash` 或可三方合并。
- 禁止修改 `.env`、密钥文件、隐藏配置，除非管理员明确允许。
- 文本大小、文件数量、操作数量必须限额。
- 模型输出必须先 parse，再生成服务端 diff；不能直接信任自然语言 diff。

应用规则：

- 文档文本变更通过 `DocumentUpdaterHandler.setDocument` 或更细粒度 OT 路径应用。
- 新建、删除、重命名、移动通过现有 EditorController/EditorHttpController 语义应用。
- 应用后广播实时协作事件，保持在线协作者一致。
- 应用后自动触发编译，可由用户关闭。
- 应用事件写入 `AgentEvent`。

## Skills 设计

内置 skills 第一批建议：

- `latex-compile-debug`：分析编译错误，定位文件和行号，提出最小修复。
- `latex-ref-bib-fix`：修复 citation、bib key、label/ref 问题。
- `academic-polish`：学术英文润色，只处理当前选择或指定文件。
- `paper-structure-review`：检查摘要、引言、方法、实验、结论结构。
- `table-figure-helper`：生成 LaTeX 表格、图片引用和 caption。
- `review-response-draft`：根据审稿意见起草回复。
- `project-cleanup`：查找未引用图片、孤立 bib 条目、重复 label。

Skill 文件格式：

```markdown
---
name: latex-compile-debug
description: 分析 LaTeX 编译错误并提出最小补丁
modelInvocable: true
requiredTools:
  - project.read_file
  - project.search
  - compile.get_last_result
  - patch.propose
---

当用户要求修复编译错误时，先读取最近编译结果...
```

加载策略：

- 每次会话只加载 skill 名称和 description。
- 命中后再加载完整内容。
- 具有副作用的 skill 默认 `modelInvocable: false`，只能用户显式触发。
- 项目级 skill 可覆盖同名全局 skill；plugin skill 需要命名空间。

## Plugins 设计

第一阶段 plugin 是只读包，包含：

- manifest。
- skills。
- instruction templates。
- tool presets。
- hook presets，但 hook 只能绑定到内置安全事件，不执行外部命令。

manifest 示例：

```json
{
  "name": "latex-submission",
  "version": "1.0.0",
  "description": "论文投稿前检查工具包",
  "skills": ["submission-check", "camera-ready-polish"],
  "toolPresets": ["latex-readonly", "compile-check"]
}
```

后续阶段再支持：

- MCP server 配置。
- 外部命令 hook。
- 插件市场。
- 版本锁定和签名。

## Hooks 设计

第一阶段只做内置 hook，不做用户自定义脚本：

- `BeforeToolUse`
  - 检查工具权限。
  - 拦截敏感路径。
  - 限制项目边界。
- `AfterPatchApplied`
  - 记录审计。
  - 触发编译。
- `AfterCompile`
  - 把错误摘要写回 agent event。
- `BeforeSessionEnd`
  - 生成总结。

后续可扩展为管理员配置的 HTTP hook 或 sandboxed script hook。

## API 设计

```text
GET  /project/:Project_id/ai/agent/config
POST /project/:Project_id/ai/agent/sessions
GET  /project/:Project_id/ai/agent/sessions/:sessionId
GET  /project/:Project_id/ai/agent/sessions/:sessionId/events
POST /project/:Project_id/ai/agent/sessions/:sessionId/turns
POST /project/:Project_id/ai/agent/sessions/:sessionId/cancel
POST /project/:Project_id/ai/agent/approvals/:approvalId/approve
POST /project/:Project_id/ai/agent/approvals/:approvalId/reject
POST /project/:Project_id/ai/agent/patches/:patchId/apply
```

事件流：

- 第一阶段使用 NDJSON，沿用当前 AI chat stream 实现风格。
- 每行是一个 `{ type, sequence, payload }`。
- 前端按 sequence 去重和恢复。
- 后续可切 SSE，但不阻塞第一阶段。

## 前端交互

Agent 面板必须显示：

- 当前 provider/model。
- 当前权限 profile 摘要。
- 已加载指令来源。
- 可用 skills。
- 计划区。
- 工具调用事件列表。
- 待审批 diff。
- 编译验证结果。
- 最终总结。

审批 UI：

- 文件级 diff。
- 操作类型标签：修改、新建、删除、重命名。
- 风险等级。
- “批准此文件”“拒绝此文件”“批准全部低风险修改”。
- 冲突时显示重新生成或取消。

## 安全设计

硬性规则：

- API Key 永不进入浏览器、prompt、事件 payload、日志。
- 项目内容和模型输出均视为不可信。
- 工具输入必须使用 zod schema 校验。
- 工具输出必须大小限制和脱敏。
- Agent 不能直接调用 MongoDB update 修改项目内容。
- Agent 不能读取宿主机文件系统。
- Agent 不能访问其他项目。
- Agent 不能执行 shell，除非后续引入独立 sandbox runtime。
- 自动应用默认关闭。

敏感路径默认拒绝：

- `.env`
- `.env.*`
- `secrets/**`
- `*.pem`
- `*.key`
- `credentials.*`
- `渠道.txt`

## 实施计划

### 阶段 1：只读 Agent Runtime 和事件流

目标：Agent 能计划、读取项目、搜索、读取编译日志，并通过事件流展示工具过程。

任务：

- [ ] 新建 `AiAgent` 模块骨架。
- [ ] 新建 `AgentSession`、`AgentEvent` 模型。
- [ ] 实现 `AiAgentToolRegistry`。
- [ ] 实现只读工具：`list_files`、`read_file`、`search`、`get_map`、`get_last_compile_result`。
- [ ] 实现 session 创建和 turn 推进。
- [ ] 前端 Agent 面板接入事件流。
- [ ] 单测覆盖工具 schema、权限、事件顺序。

验收：

- Agent 模式能回答“项目里有哪些 tex 文件”“最近编译错误是什么”。
- 所有工具调用在 UI 可见。
- 无写入能力。

### 阶段 2：指令、skills、项目地图

目标：Agent 能加载全局/项目 `AGENTS.md`，能按需加载内置 LaTeX skills。

任务：

- [ ] 实现 `AiAgentInstructionLoader`。
- [ ] 支持全局指令和项目文件指令。
- [ ] 实现 `AiAgentSkillManager`。
- [ ] 预装第一批 LaTeX skills。
- [ ] 实现 LaTeX 项目地图：root doc、input/include、bib key、label/ref。
- [ ] 前端显示指令来源和启用 skill。

验收：

- 修改项目 `AGENTS.md` 后，新 session 能看到指令来源。
- “修复编译错误”任务自动命中 `latex-compile-debug`。
- 上下文预算不会把大项目全量塞进模型。

### 阶段 3：补丁预览和人工应用

目标：Agent 能提出多文件补丁，用户审批后应用。

任务：

- [ ] 实现 `AiAgentPatchManager`。
- [ ] 定义 `AgentPatch` 模型。
- [ ] 支持 `replace_text` 和 `create_doc`。
- [ ] 前端实现 diff 审批 UI。
- [ ] 应用补丁走 DocumentUpdater/EditorController。
- [ ] 应用后触发编译。
- [ ] 记录审批和应用审计。

验收：

- Agent 可以修复一个简单 LaTeX 编译错误。
- 用户批准前项目不变。
- 应用后在线编辑器、历史、编译均一致。

### 阶段 4：文件树操作和更强验证

目标：支持重命名、移动、删除，并完善冲突处理。

任务：

- [ ] 支持 `rename_entity`、`move_entity`、`delete_doc`。
- [ ] 删除操作强制逐项审批。
- [ ] 增加 base hash 冲突检测。
- [ ] 增加三方合并或要求重新生成补丁。
- [ ] 编译失败自动把错误反馈给 agent，可继续修复。

验收：

- 文件重命名能同步文件树和协作者。
- 并发编辑导致冲突时不会覆盖用户改动。

### 阶段 5：plugins 和受控扩展

目标：管理员可安装/启用 plugin 包，项目可选择使用。

任务：

- [ ] 定义 plugin manifest。
- [ ] 支持上传/注册只读 plugin。
- [ ] 支持 plugin skill 命名空间。
- [ ] 支持 plugin tool preset。
- [ ] 管理员 UI 管理启用状态。

验收：

- 能安装一个内置 `latex-submission` plugin。
- plugin skills 可被 Agent 调用。
- 禁用 plugin 后新 session 不再加载。

### 阶段 6：隔离 Runtime、MCP、Shell

目标：在安全边界成熟后提供高级工具。

任务：

- [ ] 设计 `ContainerRuntime`。
- [ ] 工具执行容器只挂载项目临时副本。
- [ ] 输出结果以 patch 形式回传，不直接写项目。
- [ ] 支持 MCP server allowlist。
- [ ] 支持网络域名 allowlist。
- [ ] 支持 shell 命令审批和超时。

验收：

- Shell/MCP 默认关闭。
- 开启后所有外部动作可审计。
- 容器内写入不会绕过 patch 审批。

## 验证计划

后端单测：

- 指令加载顺序、预算、hash。
- skill 发现、命名冲突、禁用。
- 工具 schema 校验。
- 权限 allow/ask/deny。
- 敏感路径拦截。
- patch parse、diff、hash 冲突。
- patch apply 调用正确更新路径。
- 审计事件脱敏。

前端测试：

- Agent 面板状态。
- 工具事件列表。
- plan/act 切换。
- diff 审批交互。
- 冲突和失败状态。

集成验证：

- 启动 develop compose。
- 创建测试项目。
- 配置 AI provider。
- 运行“修复编译错误”场景。
- 确认批准前项目不变。
- 批准后文档内容变更、历史可见、编译重新运行。

浏览器验证：

- Agent rail 在桌面尺寸下可用。
- 长 diff 不溢出。
- 编译错误和审批按钮不互相遮挡。
- 流式事件逐步出现。

安全验证：

- 模型尝试读取 `渠道.txt` 时被拒绝。
- 模型尝试读取 `.env` 时被拒绝。
- 模型输出伪造 tool result 时不会被执行。
- 未写权限用户不能应用 patch。
- 被删除/禁用 provider 不可继续新 session。

## 审查清单

实现每个阶段前必须确认：

- 是否绕过了已有 collaboration/document-updater 路径。
- 是否把密钥、cookie、CSRF、session、环境变量送入模型。
- 是否让模型直接写数据库。
- 是否缺少项目权限检查。
- 是否缺少工具输入 schema。
- 是否缺少审计事件。
- 是否缺少用户审批。
- 是否会破坏现有 chat、compile、history、Git、file tree。

## 开放问题

- 文档级替换应优先使用 `setDocument`，还是实现更细粒度 OT patch apply。
- Agent session 是否需要在多人协作中共享可见，还是仅发起用户可见。
- 项目 owner 是否可配置项目级 skills，还是第一阶段仅 site admin 管理。
- 编译日志的标准化摘要应复用前端现有 parser，还是后端新增 parser。
- Git 功能是否只作为只读上下文，还是后续允许“生成 commit message”和“创建分支”。

## 推荐第一步

先做阶段 1 和阶段 2，不碰写入：

1. 建立 `AiAgent` 模块、session/event 模型、只读工具注册表。
2. 把 Agent 面板从 placeholder 变成事件流视图。
3. 加载全局/项目 `AGENTS.md` 和内置 LaTeX skills。
4. 让 Agent 能稳定完成“解释项目结构”和“分析编译错误”。

这样能先验证 agent loop、上下文、工具、指令和 UI 事件流，再进入高风险的补丁应用阶段。

## 参考资料

- OpenAI Codex CLI 仓库：https://github.com/openai/codex
- OpenAI Codex sandbox/approval 配置：https://developers.openai.com/codex/config-advanced
- OpenAI Codex 配置参考：https://developers.openai.com/codex/config-reference
- OpenAI Codex `AGENTS.md` 指南：https://developers.openai.com/codex/guides/agents-md
- Claude Code 扩展概览：https://code.claude.com/docs/en/features-overview
- Claude Code 工具参考：https://code.claude.com/docs/en/tools-reference
- Claude Code 设置和权限：https://code.claude.com/docs/en/settings
- Claude Code plugins：https://code.claude.com/docs/en/plugins
- Gemini CLI 仓库：https://github.com/google-gemini/gemini-cli
- Gemini CLI tools 文档：https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/reference/tools.md
- Gemini CLI 配置文档：https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/configuration.md
- Gemini CLI MCP 文档：https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md
- OpenHands 仓库：https://github.com/OpenHands/OpenHands
- OpenHands Runtime 文档：https://raw.githubusercontent.com/OpenHands/OpenHands/main/openhands/runtime/README.md
- aider 仓库：https://github.com/Aider-AI/aider
- aider repo map 文档：https://aider.chat/docs/repomap.html
- aider lint/test 文档：https://aider.chat/docs/usage/lint-test.html
- Cline 仓库：https://github.com/cline/cline
- Cline MCP 文档：https://docs.cline.bot/mcp/mcp-overview
