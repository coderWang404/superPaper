# 项目 Agent 工作台与 Skill/Plugin 交互优化规格

## 背景

当前 superPaper 已经把 AI 供应商管理留在管理员后台，把项目级 Agent 约束、Skills、Plugins 移到编辑器左侧项目工作台。但第一版交互仍然暴露了过多内部字段：用户需要填写 Skill ID、描述、关键词、工具列表等，视觉上也更像后台表单，不像 VS Code、Claude Code、Codex 这类 Agent 工作台。

本轮目标是把它改成“项目内可操作的 Agent 工作台”：

- 管理员后台只管理 AI 供应商。
- 项目工作台管理当前项目的约束、Skills、Plugins。
- Skill 的核心入口是 `SKILL.md`，不是多字段表单。
- Skill 支持本地 `SKILL.md`、GitHub `SKILL.md` 文件/目录链接、raw GitHub `SKILL.md` 导入。
- Plugin 是可安装的分发包，支持 GitHub 链接、HTTPS zip、服务器目录和 zip 上传。
- AI 对话区域支持显式渠道切换，并保持上下文接续。
- 前端视觉接近 IDE 侧栏：紧凑、可扫描、状态清晰、操作直接。

## 权威方案对齐

### Codex Skills

Codex 的 Skill 是一个本地目录，必需包含 `SKILL.md`。`SKILL.md` 的 frontmatter 至少提供 `name` 和 `description`，正文是给 Agent 在技能触发后加载的具体流程。复杂资料可以放在 `references/`，脚本和模板资源可以放在 `scripts/`、`assets/`，但核心不是用户手填表格，而是维护一份可审阅的 Markdown 指令文件。

### Claude Code Skills

Claude Code 同样把 Skill 定义成包含 `SKILL.md` 的文件夹。可选的 allowed tools、触发描述、渐进式加载资料都围绕 `SKILL.md` 展开。对用户来说，最自然的动作是安装、启用、禁用、打开 Markdown 编辑，而不是逐项填写内部字段。

### Plugin 分发模型

Codex/Claude Code 的插件都是可安装目录，包内可以包含 skills、commands、hooks、MCP、assets 等。superPaper 当前 v1 只启用“纯指令安全子集”：读取 manifest 和 `skills/**/SKILL.md`，拒绝 shell、hooks、MCP、后台进程等可执行能力。这样能保持多人在线编辑器的安全边界。

## 设计原则

1. **Skill 以 SKILL.md 为中心**
   - 新建 Skill 时直接打开一个 `SKILL.md` 模板。
   - 拖入 `SKILL.md` 后自动解析 frontmatter。
   - 粘贴 GitHub `blob/tree` 链接或 raw GitHub `SKILL.md` 地址后，由服务端拉取、限制大小、校验路径并打开为项目 Skill 草稿。
   - 页面默认只展示名称、描述、来源、启用状态和打开动作。
   - 兼容字段从 Markdown 解析，只有在详情/元数据摘要里展示，不作为主表单。

2. **已有 Skill 必须能显式启停**
   - 内置 Skill、项目 Skill、插件 Skill 都在同一个可扫描列表中。
   - 每行有明确开关。
   - 插件 Skill 由插件控制安装来源，但仍允许项目级启停。

3. **Plugin 安装必须先预览**
   - 输入 GitHub URL、HTTPS zip 或服务器目录后先生成预览。
   - zip 拖拽上传后自动预览。
   - 预览显示插件名、版本、安全子集、文件数量、hash、包含的 Skills。
   - 安装后只影响当前项目。

4. **项目约束像 AGENTS.md**
   - 保留一份项目级约束档案，默认名为 `Project Agent Rules`。
   - 用 Markdown 编辑器式 textarea 维护内容。
   - 运行时注入 Agent 上下文，但不写入仓库文件，避免破坏项目文档树。

5. **AI 对话保持上下文接续**
   - 用户切换 provider/model 后继续使用同一聊天历史或同一 Agent session。
   - UI 应显示当前 provider/model 选择，但不展示内部 permission profile、tool count、enabled skills 等调试信息。

## 本轮实现范围

- 重构 `AgentSettingsPanel` 为 IDE 工作台结构：
  - 顶部导入条。
  - 左侧分段导航。
  - 右侧内容编辑区。
  - Skills 列表、SKILL.md 编辑器、插件预览、项目约束编辑器。
- 重构 `AiAssistantPanel` 为紧凑 AI 工作台：
  - Provider 和 model 选择并列显示。
  - Chat/Agent 模式以 segmented control 呈现。
  - transcript 更接近编辑器侧栏消息流。
  - Agent 状态只展示“规划/执行/等待审核”等用户可理解状态。
- 更新中英文本。
- 更新前端测试，覆盖：
  - `SKILL.md` frontmatter 导入。
  - 内置/项目 Skill 启停可见。
  - Plugin GitHub 预览和 zip 上传安装。
  - Provider 切换后上下文接续。
  - Agent 页面不暴露内部调试字段。

## 不做的事

- 不开放 shell、MCP、hooks 或任意可执行 plugin。
- 不把项目约束写成仓库内真实 `AGENTS.md` 文件；这会影响用户论文项目文件树，后续如需导入/导出再单独设计。
- 不把管理员后台变成项目插件管理入口；供应商仍由管理员后台管理，项目 Agent 能力由项目工作台管理。

## 验证

- 前端单测：
  - `services/web/test/frontend/features/ai-agent-settings/components/agent-settings-panel.test.tsx`
  - `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
- 后端回归：
  - `services/web/test/unit/src/AiAgent/AiAgentSettingsManager.test.mjs`
  - `services/web/test/unit/src/AiAgent/AiAgentSkillManager.test.mjs`
- 浏览器验证：
  - 登录真实环境。
  - 打开项目。
  - 进入 AI 助手和 Agent 设置页。
  - 截图确认无布局重叠、无调试字段外露、Skill/Plugin 操作有反馈。
