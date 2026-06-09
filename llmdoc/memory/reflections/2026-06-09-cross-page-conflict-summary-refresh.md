---
name: cross-page-conflict-summary-refresh
description: 修复跨页面冲突提示不消失 bug——冲突页解决完冲突后切侧边栏菜单回首页，"去解决冲突"仍提示。根因是首页冲突摘要只在挂载时从模块级内存变量 workspaceStateCache 恢复一次、不重新拉服务端，且冲突页解决后只回写任务版本号没回写摘要；修复为首页挂载/任务变化时调 /api/tasks/{id}/conflicts?unresolvedOnly=true 以服务端为单一事实源刷新。同时记下「误用记忆里的 node 路径」「llmdoc 把内存缓存误记为 localStorage 持久化」「跨页派生状态不能只靠内存缓存恢复」三条过程教训的反思
metadata:
  type: reflection
  date: 2026-06-09
---

# 跨页面冲突摘要刷新修复：派生状态只靠内存缓存恢复导致提示不消失反思

本次起于用户报 bug——在冲突处理页 `/conflicts` 解决完冲突后，通过侧边栏切菜单返回首页 `/`，STEP 3 的「需要确认 / 去解决冲突」提示没消失。根因是首页冲突摘要这类"会被其它页面变更的派生数据"只在组件挂载时从模块级内存变量恢复一次，既不订阅变化也不重新拉服务端，而解决冲突的页面又没回写摘要。修复以服务端 `/api/tasks/{id}/conflicts?unresolvedOnly=true` 为单一事实源在首页挂载/任务变化时重新拉取。过程中还应验了项目记忆 `pnpm-scripts-need-node-path` 与 `verify-against-source-not-docs` 两条。

## Task

- 用户报告：首页 `/`（`src/app/page.tsx`，STEP 3 冲突检测与保存区）点「去解决冲突」进入冲突处理页 `/conflicts`，解决完冲突后通过侧边栏切菜单返回首页，提示仍是「需要确认 / 去解决冲突」，不消失。
- 实际范围：定位跨页面状态同步根因、修复首页提示刷新、`pnpm typecheck` 验证。

## Expected vs Actual

- 期望：在 `/conflicts` 把 blocking 冲突全部解决后回到首页，STEP 3 不再提示去解决冲突。
- 实际：回到首页仍提示去解决，因为首页拿到的是解决前的旧摘要。

## What Went Wrong

- **首页提示基于一次性恢复的本地状态。** 首页提示由本地 `conflicts` 状态（`ConflictSummary.hasBlocking`）驱动，该状态只在组件挂载时从模块级内存变量 `workspaceStateCache`（`page.tsx:177`）恢复一次，之后既不订阅 current-task 变化、也不重新向服务端拉取冲突摘要。
- **冲突页解决后没回写摘要。** 解决冲突后调用的 `syncWorkspacePreviewState`（`conflicts/page.tsx:191-193`）只 `writeCurrentTask` 更新了任务 `latestVersion`，没回写冲突摘要。于是切回首页从缓存恢复的仍是解决前的旧摘要。
- **误用记忆里的 node 路径，多花几轮排查。** 本机记忆 `pnpm-scripts-need-node-path` 明确写了 node 在 `C:\nvm4w\nodejs`，但第一次跑 typecheck 时凭印象用了错误的 `$HOME/AppData/Roaming/nvm`，报 `'node' 不是内部或外部命令`。
- **文档把内存缓存误记为 localStorage 持久化。** llmdoc `overview/project-overview.md` 的「状态管理模式」表把首页工作区状态记为「localStorage / page.tsx 完整工作区状态持久化」，但源码实为模块级内存变量 `workspaceStateCache`（刷新浏览器即丢失，并非持久化），是一处 doc-gap。

## Root Cause

- **核心：跨页面"派生数据"只靠内存缓存恢复、未以服务端为单一事实源。** 冲突摘要是会被其它页面（`/conflicts`）变更的派生数据，但首页把它当成自有本地状态处理，仅在挂载时从 `workspaceStateCache` 恢复一次。变更发生在另一个页面、且未回写到这个缓存，于是首页永远拿不到最新值。BabelTower 跨页面"当前任务"用 `src/lib/current-task.ts` 的发布订阅（内存变量 + listener Set）做到了同步，但冲突摘要既没走发布订阅、也没在挂载时重新拉服务端，两头落空。
- **跑 pnpm 前没先读相关记忆拿确切路径。** 凭印象写 node 路径，而不是先读 `pnpm-scripts-need-node-path` 确认是 `C:\nvm4w\nodejs`，导致可避免的报错与排查轮次。
- **判断状态持久化机制时以文档为准而非源码。** 文档「localStorage 持久化」的描述会误导人以为刷新后状态还在、且可跨页面共享；实际是进程内内存变量，刷新即丢。再次印证 `verify-against-source-not-docs`：判断能力/契约以源码为唯一事实源。

## 修复

- 在 `src/app/page.tsx` 新增独立 `useEffect`（依赖 `[hydrated, task?.id]`），首页挂载/任务变化时调用 `/api/tasks/{taskId}/conflicts?unresolvedOnly=true`，用服务端最新未解决冲突摘要 `setConflicts(...)` 刷新提示。
- 已验证链路自洽：导入时 blocking/warning/info 三级冲突全部入库；解决时把对应冲突 `resolvedAt` 标记已解决；该端点按 `resolvedAt: null` 重算摘要，结构与首页 `ConflictSummary` 完全一致。该端点同时服务首页（刷新提示）与冲突页（加载列表）。
- `pnpm typecheck` 通过。

## Missing Docs or Signals

- 缺「跨页面派生状态同步」的显式约定：哪些状态可只靠内存缓存恢复、哪些必须在挂载时以服务端为单一事实源重新拉取，没有统一判据，导致冲突摘要落入"只恢复不刷新"的盲区。
- `overview/project-overview.md` 状态管理表把内存缓存误记为 localStorage 持久化，缺与源码对齐的信号（已安排 recorder 修正、记入 doc-gap）。
- 缺「跑 pnpm 前先读 `pnpm-scripts-need-node-path` 拿确切 node 路径」的就近提示，导致路径凭印象出错。

## Promotion Candidates

> 以下交由 recorder 落地到稳定文档与记忆，本反思不修改稳定文档或源码。

- 修正 `overview/project-overview.md` 状态管理表：首页工作区状态实为模块级内存变量 `workspaceStateCache`（刷新浏览器即丢失），不是 localStorage 持久化；并在 `memory/doc-gaps.md` 留档此次漂移。
- 可独立沉淀一条通用经验（供 recorder 判断是否成条）：**会被其它页面变更的派生数据（如冲突摘要），不能只靠模块级内存缓存在挂载时恢复一次，应以服务端端点为单一事实源在页面挂载/关键依赖变化时重新拉取**；只有不会被跨页变更、或已接入发布订阅（如 `current-task.ts`）的状态才适合靠内存缓存恢复。`/api/tasks/{id}/conflicts?unresolvedOnly=true` 是冲突摘要的事实源，同时服务首页提示与冲突页列表。
- 强化既有记忆 `pnpm-scripts-need-node-path`：跑 pnpm 前先读该条拿确切路径 `C:\nvm4w\nodejs`，用 `export PATH="/c/nvm4w/nodejs:$PATH" && pnpm --dir C:/xuenuo/github/BabelTower <script>`，不要凭印象写路径。

## Follow-up

- recorder 按上述「提升候选」修正 `overview/project-overview.md` 状态管理表并记 doc-gap。
- 下次遇到「A 页面改了、B 页面没刷新」类 bug，先判断该状态是否为跨页派生数据：是则在 B 页面挂载/依赖变化时以服务端端点重拉，而非依赖内存缓存恢复。
- 跑 pnpm/typecheck 等脚本前，先读 `pnpm-scripts-need-node-path` 确认 node 路径再执行。
