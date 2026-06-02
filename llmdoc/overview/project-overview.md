---
name: project-overview
description: 项目背景、主要功能模块、页面路由映射与技术栈详情
metadata:
  type: overview
---

# BabelTower 项目概览

## 项目背景与目标

BabelTower 是一个中文优先的国际化（i18n）字典管理工作流系统。

**目标用户**：产品经理和工程团队
**核心场景**：
1. 导入 JSON 或 .properties 翻译文件
2. 自动检测与全局字典的冲突（相同中文不同英文、相似中文）
3. 在 UI 中编辑、解决冲突
4. 保存到字典并导出翻译文件

**MVP 范围**：字典 CRUD、冲突检测、单/双文件导入、导出
**非目标**：复杂权限、机器翻译、混合格式任务

## 主要功能模块

| 模块 | 说明 |
|------|------|
| **文件导入** | 支持 JSON 和 .properties 格式，单源/双源模式 |
| **预览编辑** | 表格形式展示解析后的条目，支持内联编辑 |
| **冲突检测** | 三级检测：完全重复(info)、相同中文不同英文(blocking)、相似中文(warning) |
| **冲突解决** | 独立冲突页面，支持保留现有、更新字典、忽略相似、手动编辑 |
| **字典管理** | 全局中英文字典，支持搜索、查看、通过任务保存更新 |
| **快照历史** | 任务版本化管理，支持自动保存和手动快照 |
| **导出** | 导出 JSON 或 .properties 文件，支持字典优先模式 |

## 页面与路由映射

### 客户端页面

| 路由 | 文件 | 功能 |
|------|------|------|
| `/` | `src/app/page.tsx` | 主工作区：项目管理、文件导入、预览表格、字典搜索、导出。约 1000 行的 monolithic 组件 |
| `/conflicts` | `src/app/conflicts/page.tsx` | 冲突解决页面。加载最新快照，计算冲突，支持 4 种解决策略 |
| `/dictionary` | `src/app/dictionary/page.tsx` | 字典搜索页面。字段过滤、防抖搜索、客户端 LRU 缓存 |
| `/export` | `src/app/export/page.tsx` | 导出页面。格式选择、文件预览、下载 |
| `/snapshots` | `src/app/snapshots/page.tsx` | 快照历史页面。任务筛选（全部/草稿/已保存等）、快照列表、冲突摘要展示、冲突处理入口 |

### API 路由

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/projects` | GET, POST | 项目列表/创建 |
| `/api/projects/{id}` | PATCH, DELETE | 更新/删除项目 |
| `/api/projects/{id}/current-task` | GET | 获取项目最新可编辑任务 |
| `/api/tasks` | GET, POST | 任务列表/文件导入 |
| `/api/tasks/{id}` | GET | 任务详情（含最新快照） |
| `/api/tasks/{id}/history` | GET | 任务快照历史 |
| `/api/tasks/{id}/snapshot` | POST | 手动创建草稿快照 |
| `/api/tasks/{id}/validate` | POST | 验证快照 |
| `/api/tasks/{id}/save` | POST | 保存到字典 |
| `/api/tasks/{id}/export` | POST | 导出文件 |
| `/api/tasks/{id}/rows` | PATCH | 更新预览行（自动保存） |
| `/api/dictionaries` | GET, POST | 字典搜索/创建更新 |
| `/api/dictionaries/conflicts` | POST | 冲突检测 |

### 布局结构

```
+----------------------------------+
| TopBar (56px)                    |
+----------+-----------------------+
| Sidebar  |                       |
| (240px)  |     main content      |
|          |                       |
+----------+-----------------------+
```

- `Sidebar`：5 个导航项（上传、冲突、字典、快照、导出）
- `TopBar`：页面标题 + 语言对徽章 `zh-CN -> en-US` + 静态用户头像
- `MessageProvider`：Toast 通知系统（Context，3 秒自动消失）

## 技术栈详情

### 运行时依赖

| 包 | 版本 | 用途 |
|----|------|------|
| next | 15.3.0 | 框架 |
| react | 19.0.0 | UI 库 |
| typescript | 5.8.x | 类型系统 |
| tailwindcss | 3.4.19 | 样式 |
| @prisma/client | 6.7.0 | ORM |
| pinyin-pro | - | 中文文本处理 |

### 开发依赖

| 包 | 版本 | 用途 |
|----|------|------|
| vitest | 3.1.0 | 测试框架 |
| @testing-library/react | - | 组件测试 |
| jsdom | - | 测试环境 |
| eslint | 9.x | 代码检查（当前忽略所有 TS/TSX） |

### 构建与部署

- **Docker**：多阶段构建（deps -> builder -> runner），基于 node:24-alpine
- **CI**：GitHub Actions，6 个并行 job（lint, typecheck, prisma-validate, openapi-validate, test, build）
- **数据库同步**：`prisma db push`（无迁移文件）
- **输出模式**：`standalone`（非 Windows 平台）

## 状态管理模式

| 模式 | 位置 | 用途 |
|------|------|------|
| `useState` + `useEffect` | 每个页面 | 本地组件状态 |
| `localStorage` | `page.tsx` | 完整工作区状态持久化 |
| 内存变量 + `Set` 监听器 | `current-task.ts` | 跨页面当前任务同步（发布订阅模式） |
| 服务端 LRU 缓存 | `api/dictionaries` | 字典查询缓存（30s TTL, 50 max） |
| 内存降级存储 | `local-store.ts` | 数据库离线回退 |
