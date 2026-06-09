---
name: frontend-conventions
description: 前端全局 Provider、二次确认组件 ConfirmPopover、浮层 Portal-to-body 定位约定与交互约定
metadata:
  type: architecture
---

# 前端组件与交互约定

记录 BabelTower 前端可复用的全局组件与交互约定。新增组件/页面应优先复用以下既有约定，而非各自实现。

## 全局消息 Provider

- `MessageProvider`（`src/components/message-provider.tsx`）在应用顶层挂载，提供顶部居中的 toast 提示。
- 通过 `useMessage()` 取得 `message` 对象，调用 `message.success / error / warning / info`，参数为字符串文案。
- 自动消失：`error`/`warning` 6 秒，`success`/`info` 3 秒；无需手动关闭。
- 反馈类提示统一走该 Provider，不使用 `alert()`。

## 二次确认组件 ConfirmPopover

- `ConfirmPopover`（`src/components/confirm-popover.tsx`，默认导出）是统一的二次确认气泡组件，无第三方依赖。
- 用法：包裹单个触发元素（通常是按钮）作为 `children`，组件克隆它并注入 `ref` 和点击打开逻辑，保留原有 `onClick`。
- 主要 props：`title`（提示 ReactNode）、`onConfirm`（支持 async，Promise resolve 前确认按钮保持「处理中...」loading 态）、`tone="danger"`（红色确认，用于删除等破坏性操作）、`confirmText` / `cancelText`、`disabled`。
- 交互：点击触发元素在其下方右对齐弹出气泡；支持点外部 / ESC 关闭，滚动或缩放时同步关闭；下方空间不足时自动翻转到上方。
- 复用 `globals.css` 的 `@keyframes slideIn` 入场动画。

## 不使用 window.confirm

- **项目约定：危险/破坏性操作的二次确认统一用 `ConfirmPopover`，不再使用浏览器原生 `window.confirm()`。**
- 现存确认点已全部替换（`src/app/users/page.tsx` 的禁用/启用与删除、`src/app/page.tsx` 的删除项目）。新写危险操作确认应复用 `ConfirmPopover`。

## 浮层 Portal-to-body 定位约定

页面内绝对/固定定位的浮层（Popover、下拉等）必须用 `createPortal` 渲染到 `document.body`，并遵循以下定位约定：

- **必须 Portal 到 body**：脱离表格/容器布局。否则浮层作为容器内兄弟节点渲染时，`getBoundingClientRect` 可能读到布局 reflow 中途的过时坐标，导致严重错位（实测气泡曾偏移约 200px）。
- **fixed + 视口坐标**：Portal 后浮层用 `position: fixed`，基于 anchor 的视口坐标（`getBoundingClientRect`）计算位置。
- **延后测量**：在双重 `requestAnimationFrame` 后再读坐标，等布局稳定，避免拿到 reflow 中途坐标。
- **算位前隐藏**：首帧位置未算出前用 `visibility: hidden`，避免在左上角闪现。
- **空间不足翻转**：下方空间不足时自动翻转到上方。
- Portal 仅在客户端挂载后渲染（`useEffect` 置 `mounted`），避免 SSR 阶段访问 `document`。

`ConfirmPopover` 即按此约定实现，是该约定的参考样板。

## 跨页面派生状态须以服务端为单一事实源

- BabelTower 跨页面「当前任务」通过 `src/lib/current-task.ts` 的发布订阅同步（模块内存变量 + listener `Set`，`subscribeCurrentTask` / `writeCurrentTask`），订阅方在变更时会被动通知。
- 但**会被其它页面变更的派生数据（如冲突摘要 `conflictSummary`），不能只依赖页面本地内存缓存恢复**——否则在 A 页解决冲突后切回 B 页，B 页组件重新挂载时会从旧缓存恢复过时数据。本次 bug 即首页 `page.tsx` 的模块级 `workspaceStateCache` 恢复了解决前的冲突摘要，仍提示「去解决冲突」。
- 正确做法：这类派生数据应以服务端端点为单一事实源，在页面挂载 / 当前任务变化时重新拉取，而非依赖内存缓存恢复。冲突摘要的权威端点是 `GET /api/tasks/{id}/conflicts?unresolvedOnly=true`，返回 `conflictSummary: {blocking, warning, info, hasBlocking}`，该端点同时服务首页（刷新提示）与冲突处理页（加载冲突列表）。
- 实现参考：`src/app/page.tsx` 在依赖 `[hydrated, task?.id]` 的 `useEffect` 中调用该端点并 `setConflicts(...)` 刷新提示。

## 跨页面未落库编辑缓冲

- 首页 STEP 2 预览行编辑是先写 React 本地状态，再通过 700ms 防抖调用 `PATCH /api/tasks/{id}/rows` 写入暂存表；用户改完后立刻点击侧边栏跳页时，组件卸载会清掉尚未执行的防抖定时器。
- 因此跨页面动作如果依赖用户最新输入（典型是 `/export` 生成译文文件），不能只依赖 `current-task.ts` 中的当前任务元数据；必须先确保最新 `PreviewRow` 已 flush 到服务端。
- `src/lib/current-task.ts` 除当前任务元数据外，还维护 `CurrentTaskDraftBuffer`（`taskId`、`baseVersion`、完整当前行补丁）。首页 `updateRow` 每次编辑都写 buffer；成功实时暂存、导入新任务、手动快照或同步字典后清理 buffer。
- `/export` 页导出前读取同任务 buffer；若任务仍是 `DRAFT`，先调用 `PATCH /api/tasks/{id}/rows` 补暂存，成功后再调用 `POST /api/tasks/{id}/export`。这样导出使用用户当前看到的译文，而不是旧快照/旧暂存行。
