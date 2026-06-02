---
name: api-contracts
description: 所有 API 端点、统一响应格式、请求/响应契约、版本并发控制与数据库降级模式
metadata:
  type: architecture
---

# API 契约与路由

## 统一响应格式

所有响应通过 `src/lib/api.ts` 的 `ok()` 和 `fail()` 包装：

```typescript
// 成功 (200-299)
{ ...data, requestId: string }

// 错误 (400+)
{ error: { message: string, details?: unknown }, requestId: string }
```

降级响应额外包含 `localFallback: true` 标志。

## 端点清单

### 健康检查

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/health` | 返回 `{ status: "ok", requestId }` |

### 项目

| 方法 | 路径 | 功能 | 查询参数 / Body |
|------|------|------|-----------------|
| GET | `/api/projects` | 项目列表 | `q` (搜索), `limit` (默认 20, 最大 100) |
| POST | `/api/projects` | 创建项目 | `{ code, name, description?, createdById? }` |
| PATCH | `/api/projects/{id}` | 更新项目 | `{ name, description? }` |
| DELETE | `/api/projects/{id}` | 删除项目 | - |
| GET | `/api/projects/{id}/current-task` | 项目最新可编辑任务 | - |

### 任务

| 方法 | 路径 | 功能 | Body / 查询参数 |
|------|------|------|-----------------|
| GET | `/api/tasks` | 任务列表 | `projectId`, `status`, `historyOnly` (默认 false) |
| POST | `/api/tasks` | 文件导入创建任务 | multipart: `projectId`, `name`, `mode`, `format`, `sourceFile`, `targetFile?` |
| GET | `/api/tasks/{id}` | 任务详情（含最新快照） | - |
| GET | `/api/tasks/{id}/history` | 快照历史列表 | `includeRows`, `latestOnly`, `limit` |
| POST | `/api/tasks/{id}/snapshot` | 手动草稿快照 | `{ baseVersion }` |
| POST | `/api/tasks/{id}/validate` | 验证快照 | `{ snapshotVersion }` |
| POST | `/api/tasks/{id}/save` | 保存到字典 | `{ snapshotVersion, conflictResolutions? }` |
| POST | `/api/tasks/{id}/export` | 导出文件 | `{ snapshotVersion, fileBaseName? }` |
| PATCH | `/api/tasks/{id}/rows` | 更新预览行（自动保存） | `{ baseVersion, rows, resolvedConflicts? }` |

### 字典

| 方法 | 路径 | 功能 | 查询参数 / Body |
|------|------|------|-----------------|
| GET | `/api/dictionaries` | 搜索字典 | `q` (必需), `field` (auto/chinese/english), `limit` (默认 20) |
| POST | `/api/dictionaries` | 创建/更新条目 | `{ chineseText, englishText, tags?, note?, resolution? }` |
| POST | `/api/dictionaries/conflicts` | 冲突检测 | `{ entries: StandardI18nEntry[] }` |

### 系统配置 / 维护

| 方法 | 路径 | 功能 | Body |
|------|------|------|------|
| POST | `/api/settings/maintenance` | 清空字典、清空快照、或同时重置快照和字典 | `{ action: "clear-dictionaries" \| "clear-snapshots" \| "reset-system" }` |

## 请求/响应数据契约

### 导入任务 (POST `/api/tasks`)

**请求**：`multipart/form-data`
- 必需：`projectId`, `name`, `mode` (SINGLE_SOURCE/DUAL_SOURCE), `format` (JSON/PROPERTIES/TS), `sourceFile` (File)
- 可选：`sourceLocale` (默认 zh-CN), `targetLocale` (默认 en-US), `targetFile` (DUAL_SOURCE 必需)

**DUAL_SOURCE key mismatch 校验**：
- 双源模式下比较 source/target 文件的 key 集合
- 不匹配时返回 400，包含缺失的 key 列表

**响应 (201)**：
```typescript
{
  task: TranslationTask,
  latestSnapshot: TaskSnapshot,
  previewRows: PreviewRow[],
  conflictSummary: { blocking, warning, info, hasBlocking },
  dictionaryHits: Record<string, string>,
  requestId: string
}
```

### 更新行 (PATCH `/api/tasks/{id}/rows`)

**请求**：
```typescript
{
  baseVersion: number,
  rows: PreviewRow[],
  resolvedConflicts?: { key: string, resolution: string }[]
}
```

**行为**：
- 验证 `baseVersion === task.latestVersion`，不匹配返回 409
- 如提供 `resolvedConflicts`，更新 `dictionaryConflict` 记录
- **任务状态决定存储目标**：
  - `DRAFT` 状态：将行数据 upsert 到 `taskDraftRow` 表（按 `taskId + rowKey` 唯一键）
  - `SAVED` 状态：直接 upsert `dictionary` 并创建 `dictionaryRevision` 审计记录
  - 其他状态：返回错误
- 重新计算未解决冲突摘要
- **不再创建 AUTOSAVED 快照**（仅更新 draftRows 或 dictionary）
- 返回 `{ currentVersion, conflictSummary?, target: "draft" | "official" }`

### 保存任务 (POST `/api/tasks/{id}/save`)

**请求**：
```typescript
{
  snapshotVersion: number,
  syncDictionary?: boolean,
  conflictResolutions?: { conflictId, resolution }[]
}
```

**行为**：
- 检查未解决的 BLOCKING 冲突，存在且未提供 resolutions 则返回 409
- 遍历 snapshot.previewRows，按 `chineseHash` 写入 Dictionary
- 使用 `seenHashes` Set 跳过任务内重复的中文
- 如果英文译文与已有字典相同（归一化后），跳过（不更新 usageCount）
- 区分 `create` 和 `update` 操作，均创建 `dictionaryRevision` 审计记录
- 标记所有未解决冲突为已解决
- **不创建新快照，不修改 task status/isEditable/latestVersion**
- **只更新 `dictionarySyncedAt`**

**响应**：
```typescript
{
  task: TranslationTask,
  snapshot: TaskSnapshot,
  dictionarySync: { created, updated, skipped },
  requestId: string
}
```

### 导出任务 (POST `/api/tasks/{id}/export`)

**请求**：
```typescript
{ snapshotVersion: number, fileBaseName?: string }
```

**行为**：
- 加载快照，验证文档
- 验证失败返回 422 `{ valid: false, validationErrors }`
- 根据 sourceFormat 选择导出器，`dictionaryPriority: true`

**响应**：
```typescript
{
  files: { [filename]: content },
  fileBaseName: string,
  requestId: string
}
```

**注意**：返回 JSON 对象（含文件内容字符串），包含两个文件：源文件（保留中文）和翻译文件（使用英文译文）。客户端用 Blob/URL.createObjectURL 处理下载。翻译文件名通过 `buildTranslatedFilename` 自动推断。

### 验证任务 (POST `/api/tasks/{id}/validate`)

**响应**：
```typescript
{
  valid: boolean,           // true = 验证通过且无未解决 blocking 冲突
  validationErrors: Array<{ field: string, message: string }>,
  unresolvedBlocking: number,
  requestId: string
}
```

### 字典搜索 (GET `/api/dictionaries`)

**查询参数**：`q` (必需), `field` (auto/chinese/english, 默认 auto), `limit` (默认 20)

**搜索策略**：
- 查询长度 >= 2 时用 `startsWith`（利用 B-tree 索引）
- 查询长度 < 2 时用 `contains`
- 搜索 `normalizedChinese` 和/或 `normalizedEnglish` 列，`mode: "insensitive"`

**服务端缓存**：LRU 缓存（TTL=30s, max=50），key 为 `(normalizedQuery, field, limit)`

**响应**：
```typescript
{
  items: Array<{
    id, chineseText, englishText, tags, note, usageCount, createdAt, updatedAt
  }>,
  requestId: string
}
```

### 字典创建/更新 (POST `/api/dictionaries`)

**行为**：
- 计算 `chineseHash`（SHA256 of normalized Chinese）
- 运行 `detectConflicts()`  against 所有字典条目（最多 500 条）
- 如存在 blocking 冲突且 resolution 不是 `UPDATE_DICTIONARY`，返回 409
- Upsert via `prisma.dictionary.upsert({ where: { chineseHash } })`
- 创建 `dictionaryRevision` 审计记录

### 冲突检测 (POST `/api/dictionaries/conflicts`)

**请求**：`{ entries: StandardI18nEntry[] }`

**行为**：加载最多 5000 条字典条目，运行 `detectConflicts()`

**响应**：
```typescript
{
  conflictSummary: {
    blocking: ConflictItem[],
    warning: ConflictItem[],
    info: ConflictItem[],
    hasBlocking: boolean
  },
  requestId: string
}
```

### 系统维护 (POST `/api/settings/maintenance`)

**请求**：
```typescript
{
  action: "clear-dictionaries" | "clear-snapshots" | "reset-system"
}
```

**行为**：
- 优先执行数据库清理；数据库不可用时回退到 `local-store.ts` 的定向清理函数。
- `clear-dictionaries`：删除 Dictionary；数据库模式级联删除 `DictionaryRevision`，`DictionaryConflict.dictionaryId` 按关系置空；内存模式清空 `dictionaries` 并置空本地冲突的 `dictionaryId`。
- `clear-snapshots`：删除 `TaskSnapshot`；数据库模式按 FK 级联删除绑定快照的 `DictionaryConflict`；内存模式清空 `snapshots` 并删除绑定快照的本地冲突。
- `reset-system`：同时执行快照和字典清理；保留项目、任务、草稿行等基础数据。

**响应**：
```typescript
{
  action: "clear-dictionaries" | "clear-snapshots" | "reset-system",
  label: string,
  storage: "database" | "memory",
  counts: Record<string, number>,
  localFallback?: true,
  requestId: string
}
```

## 错误处理模式

| 状态码 | 场景 |
|--------|------|
| 400 | 缺少必填字段、格式无效 |
| 404 | Task/snapshot 未找到 |
| 409 | 快照版本冲突、未解决 blocking 冲突、字典中文冲突 |
| 422 | 导出前验证失败 |
| 500 | 数据库错误、意外失败 |

## 版本并发控制

`PATCH /api/tasks/{id}/rows` 和 `POST /api/tasks/{id}/snapshot` 使用乐观锁：

1. 前端提交 `baseVersion`
2. 后端检查 `task.latestVersion === baseVersion`
3. 匹配则 `latestVersion++` 并创建新 snapshot
4. 不匹配返回 409

## 数据库降级模式

所有 API 路由遵循统一降级模式：

```typescript
try {
  // Prisma 操作
} catch (error) {
  if (isDatabaseUnavailable(error)) {
    // 回退到 local-store.ts
    return ok({ ...localResult, localFallback: true });
  }
  return fail(message, status);
}
```

检测的 Prisma 错误码：P1001, P1017, P2021, P2022, P2024 等。

降级响应额外包含 `localFallback: true` 标志，前端可据此提示用户当前处于降级模式。

降级覆盖范围：所有 API 路由均有对应的本地存储回退函数：

| API 路由 | 本地回退函数 |
|----------|-------------|
| GET/POST `/api/projects` | `listLocalProjects` / `createLocalProject` |
| PATCH `/api/projects/{id}` | `updateLocalProject` |
| DELETE `/api/projects/{id}` | `deleteLocalProject` |
| GET/POST `/api/tasks` | `listLocalTasks` / `createLocalImportTask` |
| GET/PATCH `/api/tasks/{id}` | `getLocalTask` / `createLocalSnapshot` |
| GET `/api/tasks/{id}/history` | `listLocalSnapshots` |
| POST `/api/tasks/{id}/save` | `saveLocalTaskToDictionary` |
| POST `/api/tasks/{id}/snapshot` | `createLocalSnapshot` |
| PATCH `/api/tasks/{id}/rows` | `upsertLocalDraftRows` + `resolveLocalConflicts` |
| GET/POST `/api/dictionaries` | `listLocalDictionaries` / `upsertLocalDictionary` |
| POST `/api/dictionaries/conflicts` | `getLocalDictionaryEntriesForConflict` |
| POST `/api/settings/maintenance` | `clearLocalDictionaries` / `clearLocalSnapshots` / `resetLocalSnapshotsAndDictionaries` |

## OpenAPI 与实现的差异

`openapi/babeltower.v1.yaml` 与实现存在多处不一致，详见 `llmdoc/reference/known-gaps.md`。

关键差异摘要：
- `standardDocuments`：spec 定义为数组，实现存储为 `{ source, target }` 对象
- `PreviewRow`：spec 使用 `zhText`/`enText`，实现使用 `sourceValue`/`translatedValue`
- 导出响应：spec 要求 `application/zip`，实现返回 JSON
- 导入响应：实现额外返回 `previewRows`、`conflictSummary`、`dictionaryHits`
