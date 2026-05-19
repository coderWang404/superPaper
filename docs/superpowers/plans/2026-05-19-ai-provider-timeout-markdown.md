# AI Provider 稳定性与 Markdown 渲染优化计划

## 背景

用户反馈 DeepSeek 请求失败，同时需要成熟的 AI Markdown 渲染能力。直接用当前 DeepSeek Provider、当前密钥和 `deepseek-v4-pro` 从 `web` 容器内探测，官方接口返回 200，流式响应里同时包含 `reasoning_content` 和最终 `content`。因此当前失败更可能来自应用层的 10 秒硬超时、真实项目上下文较大导致 V4 思考模式耗时超过本地限制，以及后端缺少脱敏诊断日志。

## 设计

- Provider Client：
  - 模型同步仍保留短超时。
  - 非流式 Chat Completion 使用更合理的请求超时。
  - 流式 Chat Completion 改为空闲超时：连接和每个 chunk 都会刷新计时器，避免长答案在固定 10 秒时被本地 Abort。
  - Provider 失败写脱敏日志，只记录 provider id、名称、model、status、错误类型和底层 cause 摘要，不记录 API Key、prompt、项目正文。
- DeepSeek V4：
  - 保留官方 V4 参数：`thinking: { type: "enabled" }` 与 `reasoning_effort: "high"`。
  - 不发送 `temperature` 等思考模式不生效的采样参数。
  - 流式解析忽略 `reasoning_content`，只把最终 `content` 渲染给用户。
- Markdown 渲染：
  - 使用项目已有依赖 `streamdown` 渲染 Markdown。它是面向 AI 流式输出的成熟 React 组件，内置 GFM、流式未闭合 Markdown 修复、HTML 清洗和链接安全处理。
  - 接入 `@streamdown/cjk`，优化中文语境下的强调、删除线和自动链接边界。
  - 支持常见 AI 回复格式：段落、标题、列表、引用、表格、行内代码、代码块、链接、强调、删除线等。
  - 只允许 http/https/hash 链接进入最终渲染；禁止脚本、事件属性和危险协议。
  - 接入聊天回复、流式回复、Agent 最终回答和 assistant message 事件正文；用户输入、工具事件和补丁 diff 仍按纯文本显示。

## 验证

- 后端：
  - Provider Client 单测覆盖 DeepSeek V4 body、流式空闲超时刷新、非 content delta 忽略。
  - AiProjectChatManager 单测覆盖 Provider 失败脱敏日志。
- 前端：
  - AI Markdown 组件测试覆盖 Markdown 输出和危险 HTML 清洗。
  - AI Assistant 面板测试覆盖 Markdown 回复渲染。
- 运行定向 type-check、eslint、stylelint。
- 重建 `web`/`webpack` 后用浏览器验证 Markdown 显示和 DeepSeek 可探测。
