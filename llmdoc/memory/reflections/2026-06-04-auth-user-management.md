---
name: auth-user-management
description: 登录鉴权、用户管理和 DRAFT 创建人隔离落地反思
metadata:
  type: reflection
  date: 2026-06-04
---

# 登录鉴权与用户管理反思

本次为 BabelTower 增加了 `User` / `UserRole`、HttpOnly Cookie 登录态、管理员用户管理、个人账号设置，以及 DRAFT 数据创建人隔离。

## 值得保留的经验

- 鉴权不能只加在页面层。业务 API 必须默认 `requireUser`，系统维护、用户管理和 debug local-store 这类高权限接口必须 `requireAdmin`。
- `createdById`、`updatedById`、`changedById`、`resolvedById` 必须由服务端当前用户写入，不能继续接收前端字段。
- DRAFT 隔离规则要严格按 `status === "DRAFT"` 判断；不要把 `isEditable=false` 单独作为共享条件，否则边界状态可能泄露草稿数据。
- Prisma 与 `local-store` fallback 要一起改。登录、用户状态、禁用 tokenVersion、删除关联检查和 DRAFT 创建人过滤都需要 fallback 语义。
- Next route handler 单测直接传普通 `Request` 时不能依赖 `next/headers` 的 `cookies()` request scope；鉴权 helper 应优先从 `NextRequest.cookies` 或普通 `Request` 的 `Cookie` header 读取。

## 验证记录

- `pnpm exec prisma generate` 通过。
- `pnpm typecheck` 通过。
- `pnpm test` 通过，16 个测试文件、147 个用例。
- `pnpm exec prisma db push` 和 `pnpm exec prisma db seed` 未完成，原因是本机 `localhost:5432` PostgreSQL 不可达；尝试 `docker compose up -d db` 时 Docker Desktop daemon 未运行。

## 文档提升

- `must/project-context.md` 补充鉴权、管理员权限和 DRAFT 创建人隔离为核心架构决策。
- `architecture/api-contracts.md` 补充 auth/account/users API、默认登录保护和审计字段来源。
- `architecture/data-model.md` 补充 User 模型和 fallback 用户存储。
