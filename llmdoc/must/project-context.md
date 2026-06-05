---
name: project-context
description: 项目是什么、核心目标、技术栈、关键术语与架构决策
metadata:
  type: must
  read_on_every_run: true
---

# BabelTower 项目上下文

## 项目是什么

BabelTower 是一个面向中文优先的国际化（i18n）字典导入、冲突检查与导出工作流系统。

核心目标：让产品经理和工程团队能够高效管理多语言翻译资源，通过字典去重和冲突检测避免翻译不一致。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15.3.0 (App Router) + React 19 |
| 语言 | TypeScript 5.8 (strict mode) |
| 样式 | Tailwind CSS 3.4.19 + 自定义 CSS (`globals.css`) |
| 数据库 | PostgreSQL via Prisma 6.7.0 |
| 测试 | Vitest 3.1.0 + jsdom + @testing-library/react |
| 构建 | Docker 多阶段 (node:24-alpine) |

## 关键术语

| 术语 | 含义 |
|------|------|
| **Standard JSON** | 领域中间结构 (`StandardI18nDocument`)，所有格式解析后的统一表示 |
| **PreviewRow** | UI 预览行，用户在工作区中直接编辑的表格行 |
| **Dictionary** | 全局中英文字典，按中文文本去重，每条记录含中文原文 + 英文译文 |
| **Task** | 一次翻译工作流实例，包含导入、编辑、保存、导出的完整生命周期 |
| **Snapshot** | 任务版本化快照，记录某一时刻的完整状态（IMPORTED / AUTOSAVED / MANUAL_DRAFT / SAVED / EXPORTED） |
| **Conflict** | 新导入条目与字典已有条目的冲突，分 blocking / warning / info 三级 |
| **Chinese-first** | 冲突检测基于中文文本而非 key，重命名 key 不会丢失字典匹配 |
| **Dual-source** | 同时上传源文件（中文）和目标文件（英文），系统自动合并 |
| **Dictionary priority** | 导出时优先使用字典中的英文译文，而非源文件中的值 |

## 最重要的架构决策

1. **Chinese-first 匹配**：冲突检测比较 `sourceValue`（中文），而非 `key`。这使得字典可以跨 key 复用翻译，但相同中文不同 key 的条目会互相冲突。

2. **Standard JSON 中间层**：所有格式（JSON / .properties / TS）先解析为 `StandardI18nDocument`，再统一处理。新增格式只需实现解析器和导出器。

3. **数据库降级模式**：当 PostgreSQL 不可用时，所有 API 路由自动回退到内存中的 `local-store.ts`。通过 Prisma 错误码（P1001, P1017 等）检测数据库状态。

4. **乐观并发控制**：`PATCH /api/tasks/{id}/rows` 和 `POST /api/tasks/{id}/snapshot` 要求 `baseVersion` 匹配 `task.latestVersion`，不匹配返回 409。

5. **中文双约束去重**：字典表同时使用 `chineseText`（原始文本唯一）和 `chineseHash`（NFKC + SHA-256 唯一）两个约束，防止形式不同但语义相同的中文重复。

6. **登录鉴权与角色权限**：除健康检查和登录接口外，业务 API 默认要求登录。登录态是 8 小时 HttpOnly Cookie 签名 token，服务端再校验用户 `isActive` 与 `tokenVersion`。系统配置、用户管理和本地存储调试接口要求 `ADMIN`。

7. **DRAFT 数据创建人隔离**：`DRAFT` 任务、草稿行和暂存快照仅创建人可读写，管理员也不越权查看。非 `DRAFT` 已保存数据对登录用户共享可见。

8. **纯函数领域层**：`src/domain/` 下的所有逻辑都是纯函数，不依赖外部状态。API 路由是薄层，仅负责 HTTP 适配和事务编排。

## 项目目录速览

```
src/
  app/           # Next.js App Router（页面 + API 路由）
  components/    # React 组件（布局、消息、图标）
  domain/        # 纯函数业务逻辑（解析器、冲突检测、导出器、保存服务）
  lib/           # 共享工具（Prisma、API 辅助、localStorage、降级存储）
```
