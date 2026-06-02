---
name: data-model
description: Prisma Schema 核心模型、中文去重机制、模型关系、事务模式与降级存储
metadata:
  type: architecture
---

# 数据模型

## Prisma Schema 配置

- **Provider**: PostgreSQL
- **连接字符串**: `DATABASE_URL` 环境变量
- **Schema 文件**: `prisma/schema.prisma`
- **无迁移文件**: 使用 `prisma db push` 进行 schema 同步

## 枚举类型

| 枚举 | 值 | 用途 |
|------|-----|------|
| `FileFormat` | `JSON`, `PROPERTIES`, `TS` | 导入/导出文件格式 |
| `TaskMode` | `SINGLE_SOURCE`, `DUAL_SOURCE` | 任务模式 |
| `TaskStatus` | `DRAFT`, `SAVED`, `READ_ONLY_HISTORY`, `CANCELLED` | 任务状态 |
| `SnapshotKind` | `IMPORTED`, `AUTOSAVED`, `MANUAL_DRAFT`, `SAVED`, `EXPORTED` | 快照类型 |
| `ConflictType` | `DUPLICATE_IDENTICAL`, `EXACT_CHINESE_DIFF_ENGLISH`, `SIMILAR_CHINESE` | 冲突类型 |
| `ConflictSeverity` | `INFO`, `WARNING`, `BLOCKING` | 冲突严重程度 |
| `ConflictResolution` | `UNRESOLVED`, `KEEP_EXISTING`, `UPDATE_DICTIONARY`, `IGNORE_SIMILAR`, `EDIT_ROW` | 冲突解决方式 |

## 核心模型

### Dictionary（字典表）

`prisma/schema.prisma`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `chineseText` | Text | **UQ** | 原始中文文本 |
| `chineseHash` | VarChar(64) | **UQ** | SHA-256 哈希 |
| `normalizedChinese` | Text | INDEX | NFKC 规范化后的中文 |
| `englishText` | Text | - | 英文翻译 |
| `normalizedEnglish` | Text | INDEX | NFKC 规范化后的英文 |
| `tags` | String[] | `@default([])` | 标签数组 |
| `note` | Text? | - | 备注 |
| `usageCount` | Int | `@default(0)` | 使用次数 |
| `createdById` | UUID? | - | 创建者（始终 null） |
| `updatedById` | UUID? | - | 更新者（始终 null） |
| `createdAt` | DateTime | `@default(now())` | 创建时间 |
| `updatedAt` | DateTime | `@updatedAt` | 更新时间 |

**关系**:
- `revisions` -> `DictionaryRevision[]` (1:N, Cascade Delete)
- `conflicts` -> `DictionaryConflict[]` (1:N, SetNull on delete)

**索引**:
- `dictionary_chinese_text_uq` on `chineseText`
- `dictionary_chinese_hash_uq` on `chineseHash`
- `dictionary_normalized_chinese_idx` on `normalizedChinese`
- `dictionary_normalized_english_idx` on `normalizedEnglish`

### DictionaryRevision（字典修订历史）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `dictionaryId` | UUID | FK, Cascade | 关联字典条目 |
| `previousEnglish` | Text? | - | 修改前的英文 |
| `nextEnglish` | Text | - | 修改后的英文 |
| `reason` | Text? | - | 修改原因 |
| `changedById` | UUID? | - | 修改者 |
| `createdAt` | DateTime | `@default(now())` | 修改时间 |

**索引**: `dictionary_revisions_dictionary_created_idx` on `(dictionaryId, createdAt)`

### ProductProject（产品项目）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `code` | VarChar(64) | **UQ** | 项目代码 |
| `name` | VarChar(128) | - | 项目名称 |
| `description` | Text? | - | 描述 |
| `currentTaskId` | UUID? | **UQ**, FK | 当前活跃任务 |
| `createdById` | UUID? | - | 创建者 |
| `createdAt` | DateTime | `@default(now())` | 创建时间 |
| `updatedAt` | DateTime | `@updatedAt` | 更新时间 |

**关系**: `tasks` -> `TranslationTask[]`

**索引**: `product_projects_name_idx` on `name`

### TranslationTask（翻译任务）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `projectId` | UUID | FK, Cascade | 所属项目 |
| `name` | VarChar(160) | - | 任务名称 |
| `mode` | TaskMode | - | 单源/双源模式 |
| `format` | FileFormat | - | 文件格式 |
| `sourceLocale` | VarChar(32) | `@default("zh-CN")` | 源语言 |
| `targetLocale` | VarChar(32) | `@default("en-US")` | 目标语言 |
| `status` | TaskStatus | `@default(DRAFT)` | 任务状态 |
| `isEditable` | Boolean | `@default(true)` | 是否可编辑 |
| `latestVersion` | Int | `@default(1)` | 最新快照版本号 |
| `sourceFilename` | VarChar(255)? | - | 源文件名 |
| `targetFilename` | VarChar(255)? | - | 目标文件名 |
| `createdById` | UUID? | - | 创建者 |
| `savedAt` | DateTime? | - | 保存时间 |
| `dictionarySyncedAt` | DateTime? | - | 字典同步时间（save API 更新） |
| `createdAt` | DateTime | `@default(now())` | 创建时间 |
| `updatedAt` | DateTime | `@updatedAt` | 更新时间 |

**关系**:
- `snapshots` -> `TaskSnapshot[]` (1:N, Cascade Delete)
- `draftRows` -> `TaskDraftRow[]` (1:N, Cascade Delete)
- `conflicts` -> `DictionaryConflict[]` (1:N, Cascade Delete)

**索引**:
- `translation_tasks_project_updated_idx` on `(projectId, updatedAt)`
- `translation_tasks_status_editable_idx` on `(status, isEditable)`

### TaskDraftRow（任务草稿行）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `taskId` | UUID | FK, Cascade | 关联任务 |
| `rowKey` | Text | **UQ** (taskId, rowKey) | 条目 key |
| `rowIndex` | Int | INDEX | 行索引顺序 |
| `keyPath` | JsonB | - | key 路径数组 |
| `sourceValue` | Text? | - | 中文原文 |
| `translatedValue` | Text? | - | 英文译文 |
| `status` | VarChar(64) | - | 条目状态 |
| `conflictLevel` | VarChar(32)? | - | 冲突级别 (blocking/warning/info) |
| `metadata` | JsonB? | - | 附加元数据 |
| `createdAt` | DateTime | `@default(now())` | 创建时间 |
| `updatedAt` | DateTime | `@updatedAt` | 更新时间 |

**约束**：
- **UQ** `task_draft_rows_task_row_key_uq` on `(taskId, rowKey)`

**索引**: `task_draft_rows_task_row_index_idx` on `(taskId, rowIndex)`

草稿行用于保存 DRAFT 任务的用户编辑。创建快照/验证/导出/保存时优先读取草稿行，无草稿时回退到最新快照的 `previewRows`。

### TaskSnapshot（任务快照）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `taskId` | UUID | FK, Cascade | 关联任务 |
| `version` | Int | - | 版本号（任务内递增） |
| `kind` | SnapshotKind | - | 快照类型 |
| `standardDocuments` | JsonB | - | 标准文档（源/目标） |
| `previewRows` | JsonB | - | 预览行数据 |
| `conflictSummary` | JsonB | - | 冲突摘要统计 |
| `validationErrors` | JsonB? | - | 验证错误 |
| `exportManifest` | JsonB? | - | 导出清单 |
| `createdById` | UUID? | - | 创建者 |
| `createdAt` | DateTime | `@default(now())` | 创建时间 |

**约束**:
- **UQ** `task_snapshots_task_version_uq` on `(taskId, version)`

**索引**: `task_snapshots_task_created_idx` on `(taskId, createdAt)`

**注意**：`standardDocuments` 在数据库中存储为 `{ source, target }` 对象（不是数组）。OpenAPI spec 将其定义为数组，这是已知不一致。

### DictionaryConflict（字典冲突记录）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | 主键 |
| `taskId` | UUID? | FK, Cascade | 关联任务 |
| `snapshotId` | UUID? | FK, Cascade | 关联快照 |
| `dictionaryId` | UUID? | FK, SetNull | 关联字典条目 |
| `type` | ConflictType | - | 冲突类型 |
| `severity` | ConflictSeverity | - | 严重程度 |
| `resolution` | ConflictResolution | `@default(UNRESOLVED)` | 解决状态 |
| `candidateKey` | Text? | - | 候选键 |
| `candidateChineseText` | Text | - | 候选中文文本 |
| `candidateEnglishText` | Text? | - | 候选英文文本 |
| `existingChineseText` | Text? | - | 现有中文文本 |
| `existingEnglishText` | Text? | - | 现有英文文本 |
| `similarity` | Float? | - | 相似度分数 |
| `reason` | Text | - | 冲突原因 |
| `resolvedById` | UUID? | - | 解决者 |
| `resolvedAt` | DateTime? | - | 解决时间 |
| `createdAt` | DateTime | `@default(now())` | 创建时间 |

**索引**:
- `dictionary_conflicts_task_severity_idx` on `(taskId, severity)`
- `dictionary_conflicts_snapshot_idx` on `snapshotId`
- `dictionary_conflicts_dictionary_idx` on `dictionaryId`

## 中文去重机制

### 双唯一约束设计

字典去重通过两个唯一约束实现：

1. **`chineseText` 唯一约束** (`dictionary_chinese_text_uq`): 确保原始中文文本不重复
2. **`chineseHash` 唯一约束** (`dictionary_chinese_hash_uq`): 通过 SHA-256 哈希实现规范化后的中文去重

### 哈希生成逻辑

`src/lib/standard.ts`:

```typescript
export function normalizeText(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function chineseHash(chineseText: string) {
  return createHash("sha256").update(normalizeText(chineseText)).digest("hex");
}
```

流程：
1. NFKC 规范化（统一全角/半角、兼容字符）
2. 去除首尾空白
3. 合并连续空白为单个空格
4. SHA-256 哈希生成 64 位十六进制字符串

### 为什么需要双约束

- `chineseText`（原始文本）约束：防止完全相同的原始文本重复插入
- `chineseHash`（规范化哈希）约束：防止语义相同但形式不同（如全角/半角差异、多余空格）的文本重复

### Upsert 模式

数据库层使用 `dictionary.upsert({ where: { chineseHash: hash }, ... })` 进行插入或更新。冲突检测时按 `chineseHash` 匹配。

## 模型关系图

```
ProductProject (1) ----< TranslationTask (N)
  |                        |
  | currentTaskId          | snapshots (1:N, Cascade)
  |                        | conflicts (1:N, Cascade)
  |                        v
  |                     TaskSnapshot (N) ----< DictionaryConflict (N)
  |                        ^
  |                        | snapshotId
  v                        |
Dictionary (1) ----< DictionaryRevision (N)
  |                    |
  | conflicts          | dictionaryId
  v                    |
DictionaryConflict (N)<-
```

## 事务使用模式

所有涉及多个写操作的地方都使用 `prisma.$transaction()`：

### 1. 任务导入 (`src/app/api/tasks/route.ts`)

```
translationTask.create()
taskSnapshot.create()          [kind=IMPORTED, version=1]
dictionaryConflict.createMany() [如有冲突]
productProject.update()        [设置 currentTaskId]
```

### 2. 行自动保存 (`src/app/api/tasks/[taskId]/rows/route.ts`)

```
translationTask.update()       [latestVersion++]
taskDraftRow.upsert()          [DRAFT 状态时，按 taskId+rowKey]
dictionary.upsert()            [SAVED 状态时，按 chineseHash]
dictionaryRevision.create()    [SAVED 状态时]
dictionaryConflict.updateMany() [解决冲突]
dictionaryConflict.groupBy()   [重新统计未解决冲突]
taskSnapshot.create()          [kind=AUTOSAVED]
```

### 3. 手动快照 (`src/app/api/tasks/[taskId]/snapshot/route.ts`)

```
translationTask.update()       [latestVersion++]
taskSnapshot.create()          [kind=MANUAL_DRAFT]
```

### 4. 保存到字典 (`src/app/api/tasks/[taskId]/save/route.ts`)

```
遍历 snapshot.previewRows:
  seenHashes.add(chineseHash)
  重复 chineseHash: skipped++
  无 existing: dictionary.create + dictionaryRevision [created++]
  英文相同: skipped++
  英文不同: dictionary.update + dictionaryRevision [updated++]
dictionaryConflict.updateMany() [标记所有未解决冲突为已解决]
translationTask.update()       [dictionarySyncedAt=new Date()]
```

**注意**：save API 不再创建 SAVED 快照，不修改 task status/isEditable/latestVersion，仅更新 `dictionarySyncedAt`。

## Prisma Client 配置

`src/lib/prisma.ts`:
- 单例模式：通过 `globalThis` 在开发环境保持 PrismaClient 实例
- 日志配置：通过环境变量 `PRISMA_LOG_QUERIES` / `PRISMA_LOG_ERRORS` 控制
- 默认日志级别：`["warn"]`

## 降级存储机制

当 `isDatabaseUnavailable(error)` 返回 true 时（检测 Prisma 错误码 P1001, P1017, P2021, P2022, P2024），系统自动切换到 `local-store.ts` 中的内存存储。

### 本地存储数据结构

```typescript
type LocalStore = {
  projects: LocalProject[];
  tasks: LocalTask[];
  snapshots: LocalSnapshot[];
  draftRows: LocalDraftRow[];
  dictionaries: LocalDictionary[];
  conflicts: LocalConflict[];
};
```

存储通过 `globalThis.__babelTowerLocalStore` 实现全局单例，在 Node.js 进程生命周期内持久化。

### 降级覆盖范围

所有 API 路由都有对应的本地存储回退函数：

| API 路由 | 本地回退函数 |
|----------|-------------|
| GET/POST `/api/projects` | `listLocalProjects` / `createLocalProject` |
| PATCH `/api/projects/{id}` | `updateLocalProject` |
| DELETE `/api/projects/{id}` | `deleteLocalProject` |
| GET/POST `/api/tasks` | `listLocalTasks` / `createLocalImportTask` |
| GET/PATCH `/api/tasks/{id}` | `getLocalTask` / `createLocalSnapshot` |
| GET `/api/tasks/{id}/history` | `listLocalSnapshots` |
| POST `/api/tasks/{id}/snapshot` | `createLocalSnapshot` |
| POST `/api/tasks/{id}/save` | `saveLocalTaskToDictionary` |
| PATCH `/api/tasks/{id}/rows` | `upsertLocalDraftRows` / `resolveLocalConflicts` |
| GET/POST `/api/dictionaries` | `listLocalDictionaries` / `upsertLocalDictionary` |
| POST `/api/dictionaries/conflicts` | `getLocalDictionaryEntriesForConflict` |
| POST `/api/settings/maintenance` | `clearLocalDictionaries` / `clearLocalSnapshots` / `resetLocalSnapshotsAndDictionaries` |

### 系统维护清理语义

系统配置页的维护操作保留项目、任务、草稿行等基础数据，只清理快照和/或字典相关数据：

- **清空字典库**：数据库模式删除 `Dictionary`，由 FK 级联删除 `DictionaryRevision`，并将 `DictionaryConflict.dictionaryId` 置空；内存模式清空 `dictionaries` 并置空本地冲突的 `dictionaryId`。
- **清空快照**：数据库模式删除 `TaskSnapshot`，由 FK 级联删除绑定快照的 `DictionaryConflict`；内存模式清空 `snapshots` 并删除绑定快照的本地冲突。
- **重置系统功能（快照、字典）**：组合执行快照和字典清理；不删除 `ProductProject`、`TranslationTask`、`TaskDraftRow`。

### 冲突类型映射

| Domain 层 ConflictItem.level | Local 层 type | Local 层 severity |
|------------------------------|---------------|-------------------|
| blocking | EXACT_CHINESE_DIFF_ENGLISH | BLOCKING |
| warning | SIMILAR_CHINESE | WARNING |
| info | DUPLICATE_IDENTICAL | INFO |

## 查询模式

| 场景 | 查询方式 |
|------|----------|
| 字典搜索 | `startsWith`（长度 >= 2）或 `contains`（长度 < 2），`mode: "insensitive"` |
| 冲突查询 | `taskId` + `severity` + `resolvedAt: null` |
| 快照查询 | `taskId` 排序，取最新版本 |
| 字典批量获取 | `findMany({ take: 5000 })` 或 `findMany({ take: 500 })` |

## 已知风险

1. **无迁移文件**：使用 `prisma db push` 进行 schema 同步，生产环境可能带来风险
2. **字典查询限制**：`take: 5000` 硬编码限制，大规模字典可能需要分页
3. **本地存储非持久化**：进程重启后数据丢失，仅用于开发/测试降级场景
