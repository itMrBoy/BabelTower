---
name: auth-single-session-clipboard
description: 登录单会话互踢与 HTTP 直访剪贴板降级反思
metadata:
  type: reflection
  date: 2026-06-11
---

# 登录单会话互踢与 HTTP 直访剪贴板降级反思

本次工作围绕两类生产/多端使用体验：同账号多处登录时只保留最新会话，以及 HTTP + IP 直访部署形态下复制初始密码仍可用。

## 值得保留的经验

- 单会话互踢不能只在前端做提示。登录成功前应在服务端递增 `tokenVersion`，再用新版本签发 Cookie；旧 token 在后续受保护 API 校验时因版本落后失效。
- `tokenVersion` 递增后必须清理进程内用户状态缓存。否则新 token 会在缓存 TTL 内拿旧版本比对，造成刚登录就被误判失效。
- 401 需要区分普通未登录/过期与「被新登录顶下线」。`requireUser()` 返回 `x-auth-reason: superseded` 后，`GET /api/auth/me`、`AuthProvider` 和 `http-client` 才能把原因传到登录页，避免用户只看到无差别跳转。
- OpenAPI 要记录这种响应头契约。它不是纯 UI 行为，而是后端鉴权语义的一部分，前端依赖该 header 决定登录页提示。
- HTTP + IP 直访不是安全上下文，`navigator.clipboard.writeText()` 可能不存在或被浏览器拒绝。复制密码这类关键操作应封装 `copyTextToClipboard()`，优先 Clipboard API，失败后降级到 `document.execCommand("copy")`。
- local-store 降级路径也要递增用户 `tokenVersion`。BabelTower 鉴权/用户能力一直要求 DB 与内存 fallback 语义对齐，不能只改 Prisma 路径。

## 验证记录

- 新增 `tests/api/auth-login.test.ts` 覆盖登录递增 tokenVersion、旧 token 返回 `x-auth-reason: superseded`、版本匹配 token 可用、缺 token 仍返回普通未登录、DB 不可用时 local-store 递增 tokenVersion。
- 本次反思基于当前工作树 diff 梳理，未在 llmdoc 更新步骤中重新运行测试；如需要交付代码前验证，优先执行 `pnpm test` 和 `pnpm typecheck`。

## 文档提升

- `architecture/api-contracts.md` 应记录登录单会话互踢、`x-auth-reason: superseded` 头，以及 local-store fallback 下 tokenVersion 同步递增。
- `architecture/frontend-conventions.md` 应记录 AuthProvider/http-client 如何透传下线原因，以及 HTTP 直访形态下复制文本的统一封装。

