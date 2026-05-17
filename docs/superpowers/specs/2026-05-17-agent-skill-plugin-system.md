# Agent Skill/Plugin 系统全面优化规格

## 背景

superPaper 已经具备第一阶段 Agent 模式：Plan/Act 状态机、只读工具、编译工具、补丁审批、内置 LaTeX skills/plugins、全局/项目设置、事件审计。下一阶段的目标是把静态内置能力升级为可安装、可审计、可禁用、可版本化的扩展体系，让管理员可以添加外部 skill 和 plugin，同时继续保持自托管 LaTeX 协作平台的安全边界。

本规格基于 2026-05-17 对权威方案的调研：

- OpenAI Codex Skills：skill 是带 `SKILL.md` 的目录，使用渐进式披露；插件是可安装分发单元。
- OpenAI Codex Plugins：插件以 `.codex-plugin/plugin.json` 为入口，可包含 skills、apps、MCP servers、hooks、assets，并由插件目录/marketplace 安装。
- Claude Code Plugins：插件是自包含目录，支持 skills、agents、hooks、MCP、LSP、monitors、themes；安装时复制到本地 cache，并明确限制路径穿越和跨目录引用。
- MCP 2025-06-18：tools 是模型可自动调用的外部能力，但客户端应展示暴露工具、敏感操作确认、输入输出校验、超时和审计。
- OpenHands/Cline/aider 等开源 Agent：成熟实现普遍把 runtime、工具、审批、沙箱、上下文选择和审计拆开，而不是仅依赖提示词。

## 核心判断

### Skill 与 Plugin 必须分层

Skill 是“工作流/知识/提示包”，用于告诉 Agent 如何完成某类任务，例如“修复 BibTeX 引用”“审查论文结构”“按学校模板检查格式”。它主要影响模型上下文，不应该天然获得执行权限。

Plugin 是“安装和分发单元”，可以打包多个 skills、资源、示例命令、未来的 MCP 配置、未来的子 Agent 等。Plugin 是否启用决定其 bundled skills 是否进入候选集。

因此 superPaper v1 的规则是：

- skill 负责指导模型。
- plugin 负责安装、版本、来源、完整性、启用状态和 bundled components。
- tool 权限仍由 `AiAgentPermissionManager` 管控，plugin 不能绕过。
- 写项目文件仍必须走 `patch.propose` 和用户审批，plugin 不能直接写 Mongo/docstore/filestore。

### 第一阶段只开放安全子集

市面最强的 Agent 产品都支持 hooks/MCP/shell，但它们也都把这些能力放进权限、沙箱和审批体系。superPaper 是多人在线协作编辑器，不是单用户本地 CLI，所以 v1 不应直接开放可执行插件能力。

v1 支持：

- `.superpaper-plugin/plugin.json` 原生 manifest。
- `.codex-plugin/plugin.json` 的安全子集。
- `.claude-plugin/plugin.json` 的安全子集。
- `skills/<skill-id>/SKILL.md` 指令型 skill。
- `references/` 和 `assets/` 的存在检查与元数据索引，但不把它们直接暴露给模型。
- 插件来源、版本、hash、文件计数、大小、安装时间、安装人、启用状态。

v1 识别但拒绝启用：

- hooks、scripts、shell、commands 中的可执行命令。
- MCP server 配置。
- LSP server、monitor、background worker。
- 会要求外部认证的 app/connectors。
- 任意二进制执行文件。

这些字段出现在 manifest 中时，安装可以选择“严格拒绝”。默认严格拒绝。后续如果要支持 MCP，必须先落独立沙箱 runtime、管理员 allowlist、工具级审批和审计。

## 包格式

### 原生 superPaper 插件

推荐布局：

```text
my-plugin/
  .superpaper-plugin/
    plugin.json
  skills/
    compile-debug/
      SKILL.md
      references/
      assets/
```

`plugin.json`：

```json
{
  "schemaVersion": "superpaper.agent.plugin.v1",
  "name": "latex-submission-check",
  "version": "1.0.0",
  "description": "Check LaTeX projects before submission.",
  "interface": {
    "displayName": "LaTeX 投稿检查",
    "shortDescription": "检查模板、引用、图片和编译日志"
  },
  "skills": "./skills/",
  "keywords": ["latex", "submission", "journal"]
}
```

### Codex 插件兼容子集

支持读取 `.codex-plugin/plugin.json` 的以下字段：

- `name`
- `version`
- `description`
- `keywords`
- `skills`
- `interface.displayName`
- `interface.shortDescription`
- `interface.longDescription`
- `interface.category`
- `interface.defaultPrompt`

检测到 `hooks`、`mcpServers`、`apps`、`.mcp.json`、`.app.json` 等字段或文件时，v1 默认拒绝安装。

### Claude 插件兼容子集

支持读取 `.claude-plugin/plugin.json` 的以下字段：

- `name`
- `version`
- `description`
- `keywords`
- `skills`
- `commands` 中的纯 markdown 命令可作为未来 prompt，但 v1 暂不注入 Agent 上下文。

检测到 hooks、MCP、LSP、monitors、agents、bin 等字段或目录时，v1 默认拒绝安装。

## Skill 格式

`SKILL.md` 必须有 YAML frontmatter：

```markdown
---
name: compile-debug
description: Fix LaTeX compile errors by reading logs and proposing minimal patches.
---

当用户要求修复编译错误时，先读取最近编译结果，再定位错误附近文件。
```

superPaper 解析字段：

- `name`：必填，kebab-case，作为 plugin namespace 下的 skill id。
- `description`：必填，用于隐式匹配。
- `displayName`：可选，前端显示名。
- `requiredTools`：可选，只允许当前 `AiAgentToolRegistry` 已注册工具。
- `keywords`：可选，辅助当前关键词评分。
- `modelInvocable`：可选，默认 true。

导入后的 skill id 使用命名空间：

```text
<plugin-name>/<skill-name>
```

这样能避免不同插件之间 skill 同名冲突，也便于前端展示来源。

## 安全模型

### 安装前校验

插件安装必须经过以下步骤：

1. 下载或读取到临时目录。
2. 解压时阻止 zip slip/path traversal。
3. 拒绝符号链接、设备文件、绝对路径。
4. 限制总文件数、总字节数、单文件大小、manifest 大小、`SKILL.md` 大小。
5. 查找 manifest，只允许一个主 manifest。
6. 校验 manifest schema 和路径字段。
7. 检测所有可执行能力字段和敏感目录。
8. 解析 skills，校验 frontmatter、正文大小、工具依赖。
9. 计算 canonical package hash。
10. 复制到只读 cache 目录，写 Mongo 安装索引。
11. upsert 对应 `AgentPluginSetting` 和 `AgentSkillSetting`。
12. 写审计事件，审计 payload 不包含 skill 正文。

### 运行时约束

- Agent 只从 Mongo 中加载启用的 skill 摘要和正文。
- 模型只能看到 skill 内容，看不到安装路径、服务器文件系统路径、密钥、cookie、环境变量。
- skill 不能声明新工具。`requiredTools` 只能引用后端已有工具。
- plugin 无法改变 `AiAgentPermissionManager` 结果。
- patch 仍为唯一写项目路径。

### 来源与完整性

安装记录保存：

- `source.type`: `local_directory`、`zip_url`、`github_archive`。
- `source.url` 或脱敏后的 `source.path`。
- `source.ref`。
- `integrity.sha256`。
- `packageBytes`、`fileCount`。
- `installedBy`、`installedAt`。

后续更新时用同一 plugin id + 新 version/hash 写入新安装版本，旧版本可保留 orphan 状态，避免正在运行的会话丢失上下文。

## 数据模型

### `AgentPluginInstallation`

集合：`agentPluginInstallations`

字段：

- `pluginId`
- `name`
- `version`
- `displayName`
- `description`
- `enabled`
- `status`: `installed`、`disabled`、`orphaned`、`failed`
- `scope`: `global`、`project`
- `projectId`
- `manifest`
- `manifestFormat`: `superpaper`、`codex`、`claude`
- `source`
- `integrity`
- `cachePath`
- `packageBytes`
- `fileCount`
- `skillIds`
- `warnings`
- `installedBy`
- `updatedBy`
- timestamps

已有的 `AgentPluginSetting` 继续承担“有效配置合并”角色；installation 是“来源与版本索引”。这样能保持现有 `getAgentConfig()` 行为稳定。

## API

### 预览插件

`POST /admin/ai/agent/plugins/preview`

请求：

```json
{
  "sourceType": "local_directory",
  "path": "/home/server/plugins/my-plugin"
}
```

返回：脱敏 manifest、技能列表、警告、hash、大小，不写库。

### 安装插件

`POST /admin/ai/agent/plugins/install`

请求：

```json
{
  "sourceType": "zip_url",
  "url": "https://github.com/org/plugin/archive/refs/heads/main.zip",
  "enabled": true
}
```

返回：安装记录、更新后的 Agent config。

### 列表与启停

- `GET /admin/ai/agent/plugins`
- `PATCH /admin/ai/agent/plugins/:pluginId`

项目级覆盖后续增加到：

- `POST /project/:Project_id/ai/agent/plugins/install`
- `PATCH /project/:Project_id/ai/agent/plugins/:pluginId`

v1 先实现全局管理员安装，项目通过现有 settings API 控制启停。

## 前端

管理员 AI Agent 页应新增：

- 已安装插件表。
- 插件来源、版本、hash、启用状态、skill 数。
- “预览外部插件”表单：本地路径或 zip/GitHub URL。
- 预览结果显示将导入的 skills 和被禁用/拒绝的能力。
- 安装按钮。
- 启用/禁用按钮。

项目侧 Agent panel 继续只显示有效 skills/plugins 摘要，不暴露密钥或服务器路径。

## 实施阶段

### 阶段 1：文档与包解析

- 写中文规格和实施计划。
- 新增 `AiAgentPluginPackageManager`，只做目录解析和安全校验。
- 单测覆盖 manifest、skill frontmatter、路径穿越、可执行字段、工具依赖、大小限制。

### 阶段 2：安装索引与 API

- 新增 `AgentPluginInstallation` 模型。
- 新增预览/安装/列表/启停接口。
- 安装时 upsert `AgentPluginSetting` 和 `AgentSkillSetting`。
- 单测覆盖 controller/manager。

### 阶段 3：运行时与显式调用

- 运行时支持 `$skill` / `@plugin` 显式调用优先。
- skill 选择从纯关键词升级为 description + explicit invocation + keyword 的组合评分。
- prompt 中加入可用 skill 摘要预算，选中后再注入完整内容。

### 阶段 4：前端管理 UI

- 管理员页接入插件预览/安装/启停。
- Agent panel 显示 skill/plugin 来源、版本和启用状态。

### 阶段 5：MCP/沙箱预研，不默认启用

- 增加独立 container runtime 设计。
- 支持管理员 allowlist 的 MCP server。
- 每个外部工具有超时、输入确认、输出净化、审计事件。

## 验收标准

- 外部插件可以从本地目录或 zip URL 预览并安装。
- 安装后新增 skills 出现在 Agent config 中，并能被运行时选中。
- 含 hooks/scripts/MCP/shell/bin 的插件默认拒绝。
- zip 包路径穿越、符号链接、过大文件会被拒绝。
- 安装记录包含来源、版本、hash、文件数量、大小、安装人。
- 前端和日志不显示 API key、cookie、环境变量或服务器敏感路径。
- 所有新增后端 API 有单测。
- 每个已验证阶段单独 commit 并 push。
