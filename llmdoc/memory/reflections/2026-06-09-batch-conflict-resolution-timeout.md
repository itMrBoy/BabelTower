---
name: batch-conflict-resolution-timeout
description: 修复冲突页“全部同步并标记”调用 PATCH /api/tasks/{id}/rows 时 Prisma 事务 5s 超时的问题。根因是后端在同一事务内按 resolvedConflicts 逐条 dictionaryConflict.updateMany，加上草稿行 upsert 和 groupBy，批量冲突时容易超过默认 5000ms；修复为按 resolution 批量 updateMany candidateKey in (...)，并把事务 timeout 提高到 30s。
metadata:
  type: reflection
  date: 2026-06-09
---

# 批量解决冲突反思：不要在默认 5s 事务内逐条更新

用户在冲突页点击“全部同步并标记”后，浏览器 Network 显示 `/api/tasks/{id}/rows` 返回 `row autosave failed`，details 指向 `prisma.dictionaryConflict.updateMany()`：事务已过期，默认 timeout 为 5000ms。

## Task

- 期望：批量同步冲突并标记解决可以一次完成。
- 实际：冲突数量较多时，后端在默认 5s 事务内逐条标记冲突，导致 Prisma 事务超时。

## Root Cause

- `src/app/conflicts/page.tsx` 的“全部同步并标记”会把多条 `resolvedConflicts` 一起提交到 `PATCH /api/tasks/{id}/rows`。
- `src/app/api/tasks/[taskId]/rows/route.ts` 原实现对每条 conflict 循环执行一次 `dictionaryConflict.updateMany()`。
- 同一个事务内还可能执行多条 `taskDraftRow.upsert()` 和最后的 `dictionaryConflict.groupBy()`；默认 5s 事务 timeout 不适合批量场景。

## Fix

- 新增 `src/lib/conflict-resolution.ts`，按 key 去重后按 resolution 分组。
- rows API 改为每个 resolution 一次批量 `updateMany({ candidateKey: { in: keys } })`。
- rows API 的 Prisma transaction 设置为 `{ maxWait: 5_000, timeout: 30_000 }`，与导入/保存这类批量写入的安全网保持一致。
- 补 `tests/api/task-rows.test.ts`，锁定批量 updateMany 次数和 30s transaction timeout。

## Promotion Candidates

- 只要 API 可能被“全部同步/批量处理”触发，就不要把 per-item update 放进默认 5s Prisma 事务里。
- 批量更新冲突、草稿行或字典时，应优先按同类字段分组批量写，再保留足够的事务 timeout。
