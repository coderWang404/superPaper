# Agent Skill/Plugin 系统实施计划

## 当前目标

把 superPaper Agent 从静态内置 skill/plugin 升级为可安装外部插件的体系。第一批实现聚焦“安全的纯指令型插件包”，不开放 shell、MCP、hooks 或脚本执行。

## 增量 1：规格文档

状态：待完成

- 写入完整中文规格。
- 记录权威方案对比和 superPaper 适配决策。
- 明确第一阶段安全边界。

验证：

- `git diff --check`
- 人工检查文档不含密钥。

## 增量 2：插件包解析与校验

状态：待开始

- 新增 `AiAgentPluginPackageManager.mjs`。
- 支持读取目录包。
- 支持 `.superpaper-plugin/plugin.json`、`.codex-plugin/plugin.json`、`.claude-plugin/plugin.json`。
- 解析 `skills/<name>/SKILL.md`。
- 实现路径、大小、文件数、manifest、frontmatter、可执行能力、工具依赖校验。
- 新增单测。

验证：

- `docker compose -f develop/docker-compose.yml run --rm web yarn --cwd services/web test:unit --run test/unit/src/AiAgent/AiAgentPluginPackageManager.test.mjs`

## 增量 3：安装索引与后端 API

状态：待开始

- 新增 `AgentPluginInstallation` 模型。
- 新增 `previewAgentPluginPackage`、`installAgentPluginPackage`、`listInstalledAgentPlugins`、`setInstalledAgentPluginEnabled`。
- 安装时 upsert `AgentPluginSetting` 和 bundled `AgentSkillSetting`。
- 新增管理员 API：
  - `GET /admin/ai/agent/plugins`
  - `POST /admin/ai/agent/plugins/preview`
  - `POST /admin/ai/agent/plugins/install`
  - `PATCH /admin/ai/agent/plugins/:pluginId`
- 新增审计摘要，禁止输出 skill 正文和敏感路径。

验证：

- 插件安装 manager 单测。
- settings manager 回归单测。
- routes/controller 单测。

## 增量 4：运行时选择优化

状态：待开始

- 支持 `$skill` 显式调用。
- 支持 `@plugin` 显式调用。
- skill 选择评分加入 description、displayName、keywords 和显式调用。
- 保持 prompt 预算，避免所有 skill 全量注入。

验证：

- `AiAgentSkillManager.test.mjs`
- `AiAgentRuntime.test.mjs`

## 增量 5：管理员 UI

状态：待开始

- 在 AI Agent 管理区增加插件列表和安装表单。
- 支持预览、安装、启停。
- 显示来源、版本、hash、skill 数和拒绝原因。

验证：

- 前端相关单测。
- 运行浏览器检查 UI。

## 提交与推送规则

每个增量完成后：

1. `git status --short`
2. `git diff --check`
3. 检查 staged diff。
4. 秘密扫描：`api[_-]?key|authorization|token|secret|password|渠道|sk-|BEGIN .*PRIVATE KEY`
5. 不 stage `渠道.txt`。
6. commit。
7. push `origin main`。
