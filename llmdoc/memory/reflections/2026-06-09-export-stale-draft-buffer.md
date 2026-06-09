---
name: export-stale-draft-buffer
description: 修复首页编辑译文后跳到导出页导出旧文本的问题。根因是首页行编辑走 700ms 防抖暂存，跳页卸载会清掉定时器，最后一次输入可能只停留在前端 rowEdits/pendingPatches 中；导出页只知道 current-task 元数据，不能访问首页未落库编辑。修复为 current-task 模块增加 currentTaskDraftBuffer，首页编辑时写入完整当前行补丁，导出页导出前先 PATCH /api/tasks/{id}/rows 补暂存；同时 local-store 导出路径改用 getLocalCurrentRows 以保持 DB/降级一致。
metadata:
  type: reflection
  date: 2026-06-09
---

# 导出旧译文反思：跨页前未落库编辑会丢失

用户在首页 STEP 2 表格修改“英文译文”后，导出的文件仍恢复为原始译文。关键现象是：编辑框已经显示新文本，但导出结果没有采用新文本。

## Task

- 用户报告：修改译文后导出的文件被还原，没有按修改后的文本导出。
- 实际范围：排查首页编辑暂存、跨页导出、后端导出数据源、local-store 降级路径。

## Expected vs Actual

- 期望：导出文件必须使用用户当前看到的 `PreviewRow.translatedValue`。
- 实际：如果用户改完译文后很快点击侧边栏进入 `/export`，首页的 700ms 防抖暂存尚未写入 `taskDraftRow`；组件卸载清掉定时器后，导出页调用 `/api/tasks/{id}/export` 只能读取旧快照/旧暂存行。

## What Went Wrong

- **跨页只同步了任务元数据。** `src/lib/current-task.ts` 原本只保存 `id/name/format/status/latestVersion/projectId`，导出页能知道“当前任务是谁”，但不知道首页还有未落库的行编辑。
- **防抖暂存与路由切换存在竞态。** 首页 `updateRow` 写 `rowEdits` 与 `pendingPatches`，并延迟 700ms 调 `/api/tasks/{id}/rows`；用户快速跳页时 `useEffect` cleanup 会清掉定时器，最后一次编辑不会进入服务端。
- **后端 local-store 导出路径与 DB 路径不一致。** DB 路径优先读取 `taskDraftRow`，local-store fallback 原来直接用 `snapshot.previewRows`，会忽略本地 draftRows。

## Root Cause

- 核心问题不是导出器 `buildDualExportFiles()` 还原了文本，而是导出 API 的输入行不是用户当前看到的行。BabelTower 的可编辑草稿行事实源在 DRAFT 阶段应优先是 `taskDraftRow` / `getLocalCurrentRows()`；跨页面导出前如果还有未落库编辑，必须先补写 `/api/tasks/{id}/rows`。

## 修复

- `src/lib/current-task.ts` 增加 `CurrentTaskDraftBuffer`，保存当前任务、baseVersion 与完整当前行补丁。
- `src/app/page.tsx` 在每次 `updateRow` 时写入 draft buffer；成功 flush、导入新任务、手动快照、保存到字典后清理 buffer。
- `src/app/export/page.tsx` 导出前读取同任务 draft buffer；若当前任务仍是 DRAFT，先调用 `PATCH /api/tasks/{id}/rows` 补暂存，成功后再调用 `/export`。
- `src/app/api/tasks/[taskId]/export/route.ts` 的 local-store fallback 改用 `getLocalCurrentRows(taskId)`，与 DB 路径的“draft rows 优先”保持一致。

## Missing Docs or Signals

- 前端文档此前只记录 `current-task.ts` 同步“当前任务”，没有说明跨页动作需要携带“未落库编辑缓冲”的场景。
- 数据流文档只写了导出由 `rowsToDocument()` 生成文档，没有明确 DRAFT 导出时当前行事实源是 draftRows，而不是快照静态 `previewRows`。

## Promotion Candidates

- 在 `architecture/frontend-conventions.md` 增加“跨页面未落库编辑缓冲”约定：只要动作可能从另一个页面触发且依赖用户最新输入，不能只依赖 current-task 元数据，必须 flush 或带 draft buffer。
- 在 `must/data-flow.md` 明确：`POST /api/tasks/{id}/export` 应使用当前行事实源；DB 模式优先 `taskDraftRow`，local-store 模式优先 `getLocalCurrentRows()`。
