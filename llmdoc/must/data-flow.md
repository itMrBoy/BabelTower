---
name: data-flow
description: 从文件导入到字典保存到导出的完整数据流、核心模型关系与状态转换
metadata:
  type: must
  read_on_every_run: true
---

# 数据流全景

## 完整流程

```
用户上传文件
    |
    v
[API] POST /api/tasks
    |
    +-- parseI18nDocument()  --> StandardI18nDocument
    |       |
    |       +-- parseJson() 或 parseProperties()
    |
    +-- mergeTargetDocument()          [DUAL_SOURCE 模式]
    |
    +-- buildPreviewRows()  --> PreviewRow[]
    |
    +-- detectConflicts()  --> ConflictSummary
    |       |
    |       +-- 双重循环 O(n*m)
    |       +-- normalizeText()  NFKC 归一化
    |       +-- jaroWinkler()  相似度计算
    |
    +-- annotateConflictLevels()  --> 带冲突级别的 PreviewRow[]
    |
    v
保存到数据库 / local-store
    |
    v
用户编辑 / 解决冲突
    |
    v
[API] PATCH /api/tasks/{id}/rows
    |
    +-- DRAFT 状态: upsert taskDraftRow (按 taskId+rowKey)
    +-- SAVED 状态: upsert dictionary + dictionaryRevision
    +-- 标记冲突已解决 (批量场景按 resolution 分组 updateMany)
    +-- 重新计算冲突摘要
    |
    v
[API] POST /api/tasks/{id}/save
    |
    +-- 遍历 snapshot.previewRows (使用 seenHashes 去重)
    +-- 新条目: dictionary.create + dictionaryRevision
    +-- 不同英文: dictionary.update + dictionaryRevision
    +-- 相同英文: 跳过
    +-- 更新 dictionarySyncedAt
    +-- 不修改 task status / isEditable
    |
    v
[API] POST /api/tasks/{id}/export
    |
    +-- 选择当前行事实源
    |       |
    |       +-- DB: 优先读取 taskDraftRow，缺失时回退 snapshot.previewRows
    |       +-- local-store: 使用 getLocalCurrentRows()（draftRows 优先，快照回退）
    |
    +-- rowsToDocument()  --> StandardI18nDocument
    +-- buildDualExportFiles()
    |       |
    |       +-- 源文件 (dictionaryPriority: false)
    |       +-- 翻译文件 (dictionaryPriority: true, 自动推断文件名；双文件导入时优先使用目标文件模板/注释)
    |
    v
下载两个文件
```

## 核心模型关系

```
ProductProject (1) ----< TranslationTask (N) ----< TaskSnapshot (N)
                                              |
                                              +----< TaskDraftRow (N)
                                              |
                                              +----< DictionaryConflict (N)

Dictionary (1) ----< DictionaryRevision (N)
Dictionary (1) ----< DictionaryConflict (N, SetNull)
```

- **ProductProject** 通过 `currentTaskId` 指向最新的可编辑任务
- **TranslationTask** 通过 `latestVersion` 跟踪最新快照版本号
- **TaskSnapshot** 通过 `(taskId, version)` 复合唯一键实现版本化
- **DictionaryConflict** 关联 task + snapshot + dictionary（可选）

## 关键状态转换

### Task 状态机

```
DRAFT  --[save]-->  SAVED (isEditable=false)
  |
  +--[cancel]--> CANCELLED

READ_ONLY_HISTORY  （历史任务，不可编辑）
```

### Snapshot 类型生命周期

```
IMPORTED        （文件导入时创建，version=1）
  |
  +-- AUTOSAVED   （行编辑自动保存）
  +-- MANUAL_DRAFT （用户手动快照）
  |
  +-- SAVED       （保存到字典，task 变为不可编辑）
  |
  +-- EXPORTED    （导出时创建）
```

### Conflict 解决状态

```
UNRESOLVED  --[用户解决]-->  KEEP_EXISTING / UPDATE_DICTIONARY / IGNORE_SIMILAR / EDIT_ROW
```

## 版本并发控制

所有修改快照的端点使用乐观锁：

1. 前端提交 `baseVersion`
2. 后端检查 `task.latestVersion === baseVersion`
3. 匹配则 `latestVersion++` 并创建新 snapshot
4. 不匹配返回 409 Conflict

涉及端点：`PATCH /api/tasks/{id}/rows`、`POST /api/tasks/{id}/snapshot`

## 事务边界

| 操作 | 事务内容 |
|------|----------|
| 任务导入 | `task.create` + `snapshot.create` + `conflict.createMany` + `project.update` |
| 行自动保存 | `task.update(latestVersion)` + `conflict.updateMany` + `snapshot.create` |
| 手动快照 | `task.update(latestVersion)` + `snapshot.create` |
| 保存到字典 | `dictionary.upsert` (逐条) + `revision.create` + `conflict.updateMany` + `snapshot.create` + `task.update` |

> 注意：`PATCH /api/tasks/{id}/rows` 也服务冲突页“同步并标记解决 / 全部同步并标记”。当请求包含多条 `resolvedConflicts` 时，后端应按 resolution 批量 `dictionaryConflict.updateMany(candidateKey in ...)`，并使用 30s 事务 timeout；不要在 Prisma 默认 5s 事务里逐条更新大量冲突。

## 导出前当前行事实源

- DRAFT 任务导出不能只看 `TaskSnapshot.previewRows`，因为用户在 STEP 2 的最新编辑先进入暂存行；DB 模式下应优先读取 `taskDraftRow`，没有 draftRows 时才回退到快照行。
- local-store 降级模式必须与 DB 模式保持一致：通过 `getLocalCurrentRows(taskId)` 取得当前行，内部同样是 draftRows 优先、快照回退。
- 从 `/export` 页面触发导出前，如果首页存在未落库编辑缓冲，应先补调 `PATCH /api/tasks/{id}/rows`，再调用 `POST /api/tasks/{id}/export`，确保导出文件使用用户当前看到的 `PreviewRow.translatedValue`。
- 双文件导入的导出不能只用源文件模板。源文件导出使用 `standardDocuments.source`；译文文件导出应优先使用 `standardDocuments.target` 的模板/metadata 来保留目标文件注释、header 和排版，再按当前行事实源替换译文值。
