# superPaper

superPaper 是一套面向论文写作、协作编辑和 AI 辅助创作的在线文档平台。
它保留了实时协作、编译预览、历史记录、Git 工作流和管理后台，
并在此基础上加入了可配置的 AI Provider、项目级问答和编辑器内 AI 助手。

## 产品功能

### 编辑与协作

- 多人实时协作编辑
- 文件树、文件上传、文件夹管理
- 自动编译与右侧 PDF 预览
- 历史版本与回溯
- 评论、共享、链接分享
- 全文搜索与项目级检索
- Git 相关导入与同步工作流

### AI 功能

- 管理员可配置多个 AI Provider
- 支持自定义 `Base URL` 和 `API Key`
- 支持模型拉取、同步、测试和启用/禁用
- 编辑器侧栏 AI Assistant
- 基于全文上下文的项目问答
- 额外叠加当前选中文本作为上下文
- 流式输出
- `Chat` 模式已可用
- `Agent` 模式前端骨架已预留，后续可扩展为文件级操作
- 管理后台支持中文和英文切换

## 快速部署

### 1. 准备环境

- Docker
- Docker Compose
- Git

### 2. 启动服务

```bash
cd develop
docker compose up -d --build
```

### 3. 打开系统

浏览器访问：

```text
http://127.0.0.1:23000
```

### 4. 创建第一个管理员

首次启动后，打开：

```text
http://127.0.0.1:23000/launchpad
```

在页面里创建第一个管理员账号。

## AI Provider 配置

管理员登录后，打开：

```text
http://127.0.0.1:23000/admin#ai-providers
```

在这里可以：

- 新增 AI Provider
- 填写 `Base URL`
- 填写 `API Key`
- 同步模型列表
- 选择默认模型
- 测试连通性
- 启用或禁用 Provider

配置完成后，进入任意项目的编辑器，打开右侧 `AI Assistant` 即可使用。

## 常用运维命令

```bash
cd develop
docker compose ps
docker compose logs -f web webpack
docker compose restart web webpack
docker compose down
```

如果机器内存较小，可以在 `develop/.env` 中设置：

```text
COMPOSE_PARALLEL_LIMIT=1
```

## 开发说明

- 前端入口由 `webpack` 容器提供
- 后端主服务由 `web` 容器提供
- 编译链路依赖 `clsi`
- 项目历史与文件存储由独立服务处理
- 本地修改后，通常只需要重建 `web` 和 `webpack`

## 许可证

本仓库代码采用 AGPL-3.0 许可证。
