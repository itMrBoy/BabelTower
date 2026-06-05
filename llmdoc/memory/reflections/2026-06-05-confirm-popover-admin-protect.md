---
name: confirm-popover-admin-protect
description: 封装 ConfirmPopover 二次确认组件替换 window.confirm，并加管理员账号禁用/删除保护反思
metadata:
  type: reflection
  date: 2026-06-05
---

# 二次确认 Popover 与管理员账号保护反思

本次为 BabelTower 封装了自定义 `ConfirmPopover` 二次确认组件，替换用户管理页与首页删除项目处的浏览器原生 `window.confirm()`；并追加管理员账号不可被禁用/删除的前后端管控。改动覆盖 4 个文件 + 1 个新组件：新增 `src/components/confirm-popover.tsx`，修改 `src/app/users/page.tsx`、`src/app/page.tsx`、`src/app/api/users/[userId]/route.ts`。

## 值得保留的经验

- 页面内绝对/固定定位的浮层（Popover、下拉）应当 `createPortal` 到 `document.body`。最初未用 Portal，气泡作为 `<td>` 内的兄弟节点渲染，`useLayoutEffect` 同步读取 anchor 的 `getBoundingClientRect` 时拿到了表格 reflow 中途的过时坐标，气泡跑到按钮上方约 200px 错位。改成 Portal 到 body + 双重 `requestAnimationFrame` 延后测量后再读坐标定位精准；位置算出前用 `visibility: hidden` 避免左上角闪现。
- 二次确认统一走 `ConfirmPopover` 组件，不再使用 `window.confirm`。项目里曾有 3 处（users 页 2 处 + 首页删项目 1 处），现已全部替换；新写危险操作确认应复用该组件。组件支持点外部/ESC 关闭、滚动或缩放时关闭、`tone="danger"` 红色确认、async onConfirm 的「处理中...」loading 态、下方空间不足时自动翻转到上方。
- 用户/管理员权限管控必须前后端双层。前端隐藏按钮只是体验，后端要独立拦截：ADMIN 的 PATCH（禁用）与 DELETE 在 DB 与 local-store 降级两条路径都返回 403。这与既有「鉴权不能只加在页面层」一脉相承，作为纵深防御保留。
- 改 users API 记得同步 `local-store` 降级路径（与 `2026-06-04-auth-user-management` 反思一致，再次印证）。本次移除了原先「系统至少需要保留一个可用管理员」的弱校验（被更严格的全-ADMIN 拦截取代），同时删掉了不再使用的 `countLocalActiveAdmins` import。
- `React.cloneElement` 注入 ref/onClick 时，TS strict 下要给 `children` 的 `ReactElement` 显式声明 props 泛型（`onClick?`、`ref?`），否则 `children.props` 被推断为 unknown 报错。

## 验证记录

- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm test` 通过，16 个测试文件、147 个用例。
- `pnpm ci:check` 通过（EXIT=0，含 prisma validate）。
- 浏览器实测（chrome-devtools，localhost:3001，降级 admin 账号 admin/Snow@123 登录）：气泡修复后正确出现在按钮正下方右对齐；维护者「李天然」禁用→启用确认流程正常、状态正确更新；管理员行显示「管理员账号受保护」无操作按钮；前端直接 fetch PATCH/DELETE 当前管理员被后端拒绝。注意：因系统只有一个 admin 且为当前登录用户，浏览器里命中的是更早的「不能禁用/删除当前登录用户」检查，新加的全-ADMIN 403 未单独触发，但代码逻辑已就位作为纵深防御。
- 未加针对 users API 的单元测试。经与用户确认，其设计初衷是系统只有一个管理员账号，前端禁用按钮 + 后端管控即可，不强求测试覆盖。

## 文档提升

- `architecture/api-contracts.md`：在用户端点表/鉴权权限段补充「ADMIN 账号不可被禁用/删除（PATCH/DELETE 返回 403）」这条管控规则。
- 建议新增前端组件约定文档（如 `reference/frontend-conventions.md` 或 `architecture/frontend-composition.md`），记录 `ConfirmPopover` 为统一二次确认组件、浮层 Portal 到 body 的约定、不再使用 `window.confirm`。由 recorder 判断是放进现有文档还是新建。
