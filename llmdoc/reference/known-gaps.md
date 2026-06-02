---
name: known-gaps
description: OpenAPI 与实现不一致、缺失功能、测试覆盖缺口、ESLint 配置问题与性能隐患
metadata:
  type: reference
---

# 已知缺口

## OpenAPI 与实现的不一致

`openapi/babeltower.v1.yaml` 与实现存在以下不一致：

| # | 领域 | OpenAPI Spec | 实现 | 严重程度 |
|---|------|-------------|------|----------|
| 1 | **导出响应格式** | `content-type: application/zip`，二进制流 | `content-type: application/json`，返回 `{ files: Record<string, string>, fileBaseName }` | **MAJOR** |
| 2 | **Task 导入响应** | `{ task, snapshot, requestId }` | `{ task, latestSnapshot, previewRows, conflictSummary, dictionaryHits }` | **MAJOR** |
| 3 | **PreviewRow 字段** | `rowId`, `zhText`, `enText`, `dictionaryText`, `finalEnText`, `conflicts[]` | `key`, `keyPath`, `sourceValue`, `translatedValue`, `status`, `conflictLevel` | **MAJOR** |
| 4 | **PreviewRowPatch** | `rowId`, `zhText`, `enText`, `dictionaryText` | `rows` 数组含 `key`, `keyPath`, `sourceValue`, `translatedValue`, `status` | **MAJOR** |
| 5 | **StandardI18nDocument** | `schemaVersion`, `format`, `role`, `keySeparator`, `entries`, `meta` | `entries`, `locale`, `sourceFormat`, `sourceName`, `metadata` | **MAJOR** |
| 6 | **StandardI18nEntry** | `key`, `keyPath`, `value`, `valueType`, `order`, `source`, `flags` | `key`, `keyPath`, `sourceValue`, `translatedValue`, `locale`, `status`, `sourceLocation`, `metadata` | **MAJOR** |
| 7 | **ConflictCheckRequest** | `candidates` 数组含 `chineseText`, `englishText` | `entries` 数组含 `key`, `keyPath`, `sourceValue`, `translatedValue` | **MAJOR** |
| 8 | **ConflictCheckResponse** | `summary`, `conflicts[]`, `canWriteDictionary` | `{ conflictSummary }`（含 `blocking`, `warning`, `info`） | **MAJOR** |
| 9 | **standardDocuments 存储** | 定义为数组 | 实现存储为 `{ source, target }` 对象 | **MAJOR** |
| 10 | **DictionarySearchResponse** | `items: { entry, matchType, score }[]` | `items: DictEntry[]`（无 matchType/score） | **MAJOR** |
| 11 | **ValidationResponse** | `valid`, `errors[]` | `valid`, `validationErrors[]`, `unresolvedBlocking` | Minor |
| 12 | **TaskStatus** | `DRAFT`, `SAVED`, `READ_ONLY_HISTORY`, `CANCELLED` | 同上 + `IN_REVIEW`, `FAILED` | Minor |
| 13 | **SaveTaskRequest** | `syncDictionary`, `conflictResolutions[]` | `syncDictionary` 未使用；`resolutions` 形状不同 | Minor |

**建议**：OpenAPI spec 应更新以匹配实际实现，或实现应重构以匹配 spec。当前 spec 不能作为 API 调用的可靠参考。

## 缺失的功能

### DELETE 操作
- 项目 DELETE 已添加：`DELETE /api/projects/{projectId}`
- 任务、快照、字典条目仍无 DELETE 端点
- OpenAPI spec 也未定义 DELETE 操作
- `TrashIcon` 组件存在于 `icons.tsx` 但未被使用

### 认证与授权
- 无登录页面、认证中间件、会话/令牌处理
- 所有 API 路由公开可访问
- `createdById`, `changedById`, `resolvedById` 等字段始终为 null
- TopBar 显示静态 "Z" 头像，无用户菜单

### 分页
- API 端点接受 `limit` 参数但无 `offset`/`cursor`
- 前端无分页 UI，显示所有返回项
- 任务列表在首页手动切片为 `tasks.slice(0, 5)`
- 字典页面显示 "共 X 条记录" 但无分页控件

### 快照恢复
- Snapshots 页面可浏览历史但无法恢复到可编辑状态
- Export 页面只能导出当前任务的最新版本，无法导出特定历史版本

### 字典编辑
- Dictionary 页面只读，无编辑、删除或批量导入功能

## 测试覆盖缺口

| 缺口 | 说明 |
|------|------|
| 无前端组件测试 | `@testing-library/react` 已安装但无 `.tsx` 测试文件 |
| 无 API 路由测试 | Next.js API routes 未测试 |
| 无数据库集成测试 | test job 使用真实 PostgreSQL，但测试代码中无直接 Prisma/数据库操作 |
| 无 E2E 测试 | 无 Playwright/Cypress 配置 |
| 覆盖率未强制执行 | CI 仅生成报告，无阈值检查 |

当前 14 个测试文件覆盖：解析器、冲突检测、导出器、工具函数、性能、边界、集成。核心领域逻辑覆盖完整。

## ESLint 配置问题

`eslint.config.mjs` 当前配置极为宽松：

```javascript
ignores: [
  "**/*.ts",      // 忽略所有 TS 文件
  "**/*.tsx",     // 忽略所有 TSX 文件
]
```

- 所有 `.ts` 和 `.tsx` 文件被显式忽略
- 仅对 `.js/.mjs/.cjs` 文件启用基本 ECMAScript 规则
- `eslint-config-next` 已安装但未实际使用
- TypeScript 类型安全完全依赖 `tsc --noEmit`，而非 ESLint

## 性能隐患

| 隐患 | 位置 | 说明 |
|------|------|------|
| 冲突检测 O(n*m) | `conflict-detector.ts` | 字典 5000 条 + 新文件 1000 条 = 500 万次比较，每次含正则替换和可能的 O(L^2) 相似度计算 |
| 字典查询硬编码限制 | `tasks/route.ts`, `dictionaries/conflicts/route.ts` | `take: 5000` / `take: 500`，无分页机制 |
| 大页面组件 | `src/app/page.tsx` | 约 1000 行，20+ state 变量，混合项目管理、文件导入、行编辑、字典搜索、导出 |
| 无服务端分页 | API 层 | 大数据集（任务、字典条目、快照）可能导致性能问题 |

## 其他问题

| 问题 | 说明 |
|------|------|
| 无错误边界 | 无全局错误处理组件 |
| 遗留类型文件 | `src/types.ts` 包含未使用的旧类型（I18nEntry, StandardJson, Conflict 等） |
| 无部署 Job | CI 仅做质量检查，无自动部署到 staging/production |
| Windows 构建差异 | `next.config.mjs` 在 Windows 平台禁用 `standalone` 输出，Docker 构建必须在 Linux 环境 |
| Prisma config 复制 | Dockerfile 复制 `prisma.config.ts`，但 Prisma 6.x 通常不需要单独配置 |
