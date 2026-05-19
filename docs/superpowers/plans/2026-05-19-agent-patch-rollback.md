# Agent 补丁回滚实现计划

## 目标

Agent 模式中每一次由 `patch.propose` 产生并被用户应用的改动，都必须能在同一条补丁消息卡片里回滚。回滚必须走现有编辑器/文档更新链路，不能让模型或前端直接写数据库。

## 设计

- `applyPatch` 应保存只在服务端使用的 `rollbackOperations`：
  - `replace_text`：保存应用前全文、应用后 hash。
  - `create_doc`：保存创建后的 path/docId/content hash，回滚时删除该文档。
  - `delete_doc`：保存删除前全文，回滚时按原路径重建文档。
  - `rename_entity`：保存新旧路径、docId、内容 hash，回滚时改回原文件名。
  - `move_entity`：保存新旧路径、docId、内容 hash，回滚时移回原目录。
- `rollbackPatch` 只允许回滚 `applied` 状态补丁。
- 回滚先对所有反向操作做冲突预检：
  - 被恢复/删除/移动的目标必须仍处于 Agent 应用后的状态。
  - 需要重建或移回的原路径不能已被其他文档/文件占用。
  - 如果预检失败，不做任何实际回滚，返回 409。
- 回滚成功后：
  - 补丁状态改为 `rolled_back`。
  - 记录 `patch_rolled_back` 事件。
  - 自动重新编译一次，并把编译结果返回给前端。
- 前端在 `AgentPatchReview` 消息卡片内：
  - `pending` 显示 Reject / Apply。
  - `applied` 且可回滚时显示 Roll back。
  - `rolled_back` 显示已回滚状态，不再显示操作按钮。

## 验证

- 单元测试覆盖后端 apply/rollback：
  - replace text 回滚。
  - create doc 回滚。
  - delete doc 回滚。
  - route/controller 暴露 rollback endpoint。
- 前端测试覆盖：
  - 应用后同一卡片显示 Roll back。
  - 点击 Roll back 调用 rollback API 并更新状态。
- 运行定向 lint、type-check、frontend/backend tests。
