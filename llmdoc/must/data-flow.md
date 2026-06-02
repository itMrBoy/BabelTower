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
    +-- 标记冲突已解决
    +-- 创建 AUTOSAVED snapshot
    |
    v
[API] POST /api/tasks/{id}/save
    |
    +-- 优先取 draftRows，回退到 snapshot.previewRows
    +-- upsert dictionary (chineseHash 去重)
    +-- 创建 dictionaryRevision 审计记录
    +-- 标记 task status=SAVED, isEditable=false
    +-- 创建 SAVED snapshot
    |
    v
[API] POST /api/tasks/{id}/export
    |
    +-- rowsToDocument()  --> StandardI18nDocument
    +-- exportToJson() / exportToProperties() / exportToTs()
    |       |
    |       +-- dictionaryPriority: true
    |
    v
下载文件
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
