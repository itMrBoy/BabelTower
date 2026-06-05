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
