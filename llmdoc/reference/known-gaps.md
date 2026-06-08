---
name: known-gaps
description: OpenAPI 与实现一致性（含历史偏差留档）、缺失功能、测试覆盖缺口、ESLint 配置问题与性能隐患
metadata:
  type: reference
---

# 已知缺口

## OpenAPI 与实现的一致性

`openapi/babeltower.v1.yaml` 已以 route handler 源码为准完整重写并对齐实现，可作为 API 调用的可靠参考：

- 新增 `cookieAuth` securityScheme（`apiKey` in cookie：`babeltower_session`），全局默认 `security: [{ cookieAuth: [] }]`；公开接口（getHealth/login/logout/getCurrentUser）标 `security: []`。
- 补齐了之前缺失的已实现接口：`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`、`PATCH /account`、`GET/POST /users`、`PATCH/DELETE /users/{userId}`、`PATCH/DELETE /projects/{projectId}`、`GET /tasks/{taskId}/conflicts`、`POST /settings/maintenance`。
- 使用 OpenAPI 3.1 联合类型 `type: [X, "null"]` 表达可空（非 3.0 的 `nullable`）。
- `redocly lint openapi/babeltower.v1.yaml` 现 0 error，仅余 3 个无害 warning：`info-license`、health/logout 的 `operation-4xx-response`。

### 历史偏差（已于本次重写修复）

下表记录的偏差曾导致 spec 不可作为可靠参考，现已全部对齐源码，仅作历史留档：

| # | 领域 | 旧 OpenAPI Spec | 已对齐的实现 |
|---|------|-----------------|--------------|
| 1 | **导出响应格式** | `content-type: application/zip`，二进制流 | JSON `{ valid, files: Record<string, string>, fileBaseName }` |
| 2 | **Task 导入响应** | `{ task, snapshot, requestId }` | `{ task, latestSnapshot, previewRows, conflictSummary, dictionaryHits }` |
| 3 | **PreviewRow 字段** | `rowId`, `zhText`, `enText`, `dictionaryText`, `finalEnText`, `conflicts[]` | `key`, `keyPath`, `sourceValue`, `translatedValue`, `status`, `conflictLevel` |
| 4 | **PreviewRowPatch** | `rowId`, `zhText`, `enText`, `dictionaryText` | `rows` 数组含 `key`, `keyPath`, `sourceValue`, `translatedValue`, `status` |
| 5 | **StandardI18nDocument** | `schemaVersion`, `format`, `role`, `keySeparator`, `entries`, `meta` | 对象 `{ entries, locale, sourceFormat, sourceName, metadata }` |
| 6 | **StandardI18nEntry** | `key`, `keyPath`, `value`, `valueType`, `order`, `source`, `flags` | `key`, `keyPath`, `sourceValue`, `translatedValue`, `locale`, `status`, `sourceLocation`, `metadata` |
| 7 | **ConflictCheckRequest** | `candidates` 数组含 `chineseText`, `englishText` | `{ entries: StandardI18nEntry[] }` |
| 8 | **ConflictCheckResponse** | `summary`, `conflicts[]`, `canWriteDictionary` | `{ conflictSummary }`（含 `blocking`, `warning`, `info`） |
| 9 | **standardDocuments 存储** | 定义为数组 | `StandardDocuments` 对象 `{ source, target }` |
| 10 | **DictionarySearchResponse** | `items: { entry, matchType, score }[]` | `items: DictionaryEntry[]`（无 matchType/score） |
| 11 | **ValidationResponse** | `valid`, `errors[]` | `valid`, `validationErrors[]`, `unresolvedBlocking` |
| 12 | **TaskStatus** | `DRAFT`, `SAVED`, `READ_ONLY_HISTORY`, `CANCELLED` | 同上 + `IN_REVIEW`, `FAILED` |
| 13 | **其他枚举/响应补齐** | `FileFormat` 缺 TS；`ConflictResolution` 含 `UNRESOLVED`；降级响应缺 `localFallback` | `FileFormat` 补 `TS`；`ConflictResolution` 为 `KEEP_EXISTING`/`UPDATE_DICTIONARY`/`IGNORE_SIMILAR`/`EDIT_ROW`；降级响应补 `localFallback` |

## 缺失的功能

### DELETE 操作
- 项目 DELETE 已添加：`DELETE /api/projects/{projectId}`
- 任务、快照、字典条目仍无 DELETE 端点
- OpenAPI spec 也未定义 DELETE 操作
- `TrashIcon` 组件存在于 `icons.tsx` 但未被使用

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
| API 路由测试不全 | 大部分 Next.js API routes 仍无测试，已有 `settings-maintenance`、`dictionaries-search` 两个路由的契约测试 |
| 无数据库集成测试 | test job 使用真实 PostgreSQL，但测试代码中无直接 Prisma/数据库操作 |
| 无 E2E 测试 | 无 Playwright/Cypress 配置 |
| 覆盖率未强制执行 | CI 仅生成报告，无阈值检查 |

当前 18 个测试文件覆盖：解析器、冲突检测、导出器、工具函数、性能、边界、集成、API 路由契约。核心领域逻辑覆盖完整。

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
| 字典搜索 contains 顺序扫描 | `dictionaries/route.ts` GET | 搜索用 `contains`（`LIKE '%x%'`）保证包含语义正确，但走顺序扫描、无法用 B-tree 索引。当前 50 条 / 预期 2 万条内无感（个位数~十几 ms，叠加前后端双层缓存）。**升级路标**：增长到约 10 万行并观测到变慢时，引入 PostgreSQL `pg_trgm` 扩展 + GIN 索引（`gin_trgm_ops`）让 `contains` 走索引。**勿回头改语义**：提交 `d32489c` 曾误用 `startsWith` 前缀搜索蹭索引、破坏包含语义，已修复，见下方「索引可加速性」说明 |
| 大页面组件 | `src/app/page.tsx` | 约 1000 行，20+ state 变量，混合项目管理、文件导入、行编辑、字典搜索、导出 |
| 无服务端分页 | API 层 | 大数据集（任务、字典条目、快照）可能导致性能问题 |

### 索引可加速性（通用工程经验）

B-tree 索引按序排列，只能加速**前缀查询**（`startsWith` / `LIKE 'x%'`），无法加速**包含查询**（`contains` / `LIKE '%x%'`）。**「为蹭索引把包含搜索改成前缀搜索」是破坏正确性的反模式**——前缀与包含是两种语义，改完功能就坏（搜「安全」漏掉「办公安全空间」）。包含搜索要走索引需上 trigram（`pg_trgm` + GIN，`gin_trgm_ops`），而非偷换语义。下次遇到「以性能为名」改动这类隐性语义前，先确认是否存在真实性能问题、改动是否改变了语义。

## 其他问题

| 问题 | 说明 |
|------|------|
| 无错误边界 | 无全局错误处理组件 |
| 遗留类型文件 | `src/types.ts` 包含未使用的旧类型（I18nEntry, StandardJson, Conflict 等） |
| 无部署 Job | CI 仅做质量检查，无自动部署到 staging/production |
| Windows 构建差异 | `next.config.mjs` 在 Windows 平台禁用 `standalone` 输出，Docker 构建必须在 Linux 环境 |
| Prisma config 复制（实现说明，非缺口） | Dockerfile 复制 `prisma.config.ts` 是必需步骤：builder 阶段 `prisma generate` 依赖它解析 schema 路径并注入占位 `DATABASE_URL`，详见 `reference/ci-and-tooling.md` 的「Docker 构建链」 |
