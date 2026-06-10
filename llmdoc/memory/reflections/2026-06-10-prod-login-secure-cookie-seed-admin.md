---
name: prod-login-secure-cookie-seed-admin
description: v0.1.2 发版成功后首登连环 401 排障反思：漏点手动 seed_admin job 导致库里无 admin（业务 401、日志无报错）、HTTP 直访形态下 NODE_ENV=production 触发 Secure cookie 被浏览器静默丢弃导致登录成功仍全 401，引入 AUTH_COOKIE_SECURE 开关修复；附带发现 AUTH_SECRET 未注入的 session 重启失效隐患
metadata:
  type: reflection
  date: 2026-06-10
---

# 生产首登排障：seed_admin 漏点与 Secure cookie 在 HTTP 直访下被丢弃

v0.1.2 通过 GitLab tag 流水线部署成功（`http://10.2.0.105:3000` HTTP 直访，见同日 `2026-06-10-gitlab-ci-runner-pipeline-fix.md`）后，用户首次用初始管理员 admin / Snow@123 登录，遭遇两层连环问题：先是登录直接 401「用户名或密码错误」，修好后登录 200 成功、但后续所有鉴权接口又全部 401「请先登录」。两层问题的共同点是**日志里都没有任何报错**——一个是业务正常分支，一个是浏览器端静默丢弃 cookie。本篇是上一篇流水线反思的直接续集：第二层问题正是「IP+端口 HTTP 直访」决策当时未被审视的连带后果。

## Task

- 部署成功后完成初始管理员首次登录，使系统进入可用状态。
- 实际演变为两层登录故障的逐层排障 + 一处 cookie secure 策略的代码修复（`AUTH_COOKIE_SECURE` 开关）。

## Expected vs Actual

- 期望：部署成功即可用 admin / Snow@123 登录进入系统。
- 实际：第一次登录 401「用户名或密码错误」（库里没有 admin 用户——seed_admin 手动 job 没点）；触发 seed 后登录 200，但 `/api/auth/me` 等鉴权接口全部 401「请先登录」（Secure cookie 在 HTTP 下被浏览器丢弃）；改代码引入 `AUTH_COOKIE_SECURE=false` 并打新 tag 重新发版后才真正可用。

## What Went Wrong（排障时间线）

1. **登录 401「用户名或密码错误」，第一反应去查应用日志——查不到任何东西。** 该 401 是业务正常分支（`src/app/api/auth/login/route.ts:14`，查不到用户即返回），不是异常，日志里本来就不会有报错。排查第一步应是**先判断报错是异常还是业务分支**，业务分支要查数据而非日志。
2. **根因：`seed_admin` 是独立的手动 job（needs: deploy，when: manual），用户只点了 deploy 没点它。** 首次发版后必须在 GitLab UI 再手动点一次才会执行 `prisma db seed` 创建 admin。验证手段：`docker compose -p babeltower exec db psql -U babeltower -d babeltower -c 'SELECT username, role, is_active FROM users;'` 查询为空即确认。修复：手动触发 seed_admin（seed 幂等，不怕重复点）。
3. **登录 200 后所有鉴权接口 401「请先登录」。** 根因：`sessionCookieOptions()` 原为 `secure: process.env.NODE_ENV === "production"`，生产容器 NODE_ENV=production → cookie 带 Secure 属性；而部署形态是 HTTP 直访（无 TLS）。浏览器规则：Secure cookie 只在 HTTPS（或 localhost）下保存，login 的 Set-Cookie 被浏览器**静默丢弃** → 后续请求无 cookie → 全部 401。DevTools 验证：login 响应的 Set-Cookie 行有黄色警告（Secure attribute but connection not secure）；Application → Cookies 里无 `babeltower_session`。
4. **修复（与用户对齐后选定）：引入 `AUTH_COOKIE_SECURE` 环境变量开关**——设置时显式覆盖（"true"/"false"），未设置时保持原行为（生产默认 Secure）。改动：`src/lib/auth.ts:96-108`（三元逻辑 + 中文注释）、`docker-compose.yml` app 服务 environment 加 `AUTH_COOKIE_SECURE: "false"`、`.env.prod.example` 登记、`DEPLOYMENT.md` 环境变量表新增一行。备选被否方案：按 `x-forwarded-proto` 动态判断（改动面大）；直接 `secure: false`（上 HTTPS 后不安全）。
5. **生效路径：代码在镜像里，必须打新 tag 重新走流水线**——与上一篇反思的「retry 旧 tag 无效」同一条规则的再次应验。
6. **本机验证时的 Windows 工具链坑：** Windows + nvm4w 环境下 pnpm 安装的 .cmd shim（tsc/prisma 等）报 `'node' 不是内部或外部命令`，需绕过 shim 直接 `node node_modules/typescript/lib/tsc.js --noEmit`、`node node_modules/prisma/build/index.js generate`。

## Root Cause

- **「HTTP 直访」决策做出时，没人全局排查代码里有哪些 `NODE_ENV === "production"` 触发的 HTTPS 隐含假设。** Secure cookie 就是漏网的一处。去 TLS / HTTP 直访类部署决策的影响面不止于网络层，凡 Secure cookie、HSTS、HTTPS redirect 等「生产即 HTTPS」的代码假设都需逐一核对。
- **seed_admin 的「首发后必须手动点一次」没有任何文档或流程提示。** 流水线设计上它是有意的手动卡点（避免每次发版重置数据），但「漏点后的症状」（登录 401 用户名或密码错误、日志无报错）与「凭据错误」完全无法区分，缺一条排障指引。
- **两层故障都是「静默无日志」型：** 业务分支 401 不会写错误日志；浏览器丢弃 Secure cookie 发生在客户端，服务端视角看登录完全成功。依赖「查应用日志」这一条路径必然卡死，需要补充「查库」和「查 DevTools 网络面板」两条排查路径。

## Missing Docs or Signals

- `reference/gitlab-release-pipeline.md` 虽已记录 seed_admin job 的存在（「仅首次发版点一次」），但没写**漏点的症状特征**（登录 401「用户名或密码错误」且日志无报错）与**查库确认命令**。
- 「部署访问形态」节没写 HTTP 直访的代码侧前置条件：`AUTH_COOKIE_SECURE=false` 必须设置，否则登录后全 401。
- `reference/known-gaps.md` 未记录：`src/lib/auth.ts:43-49` 在 `AUTH_SECRET`/`NEXTAUTH_SECRET` 未设置时 fallback 到 `randomBytes(32)` 随机生成签名密钥，而 docker-compose.yml 未注入 AUTH_SECRET → **每次容器重启所有用户 session 全部失效**（被迫重登）；多实例部署下各实例互不认 token。本次发现但未修。
- 缺一条通用排障经验：401/403 类报错先区分「异常」还是「业务正常分支」——业务分支日志无报错，应直接查数据状态。

## Promotion Candidates

> 以下交由 recorder 落地到稳定文档，本反思不修改稳定文档或源码。

- `reference/gitlab-release-pipeline.md`「部署访问形态」节补充：HTTP 直访形态要求 `AUTH_COOKIE_SECURE=false`（docker-compose.yml 已设置），否则 NODE_ENV=production 的 Secure cookie 被浏览器静默丢弃，登录成功后所有鉴权接口 401；DevTools 验证方法（Set-Cookie 黄色警告 + Application→Cookies 为空）。
- `reference/gitlab-release-pipeline.md` seed_admin 行补充：首发后必须手动点 seed_admin；**漏点的症状是登录 401「用户名或密码错误」且应用日志无任何报错**；确认命令 `docker compose -p babeltower exec db psql -U babeltower -d babeltower -c 'SELECT username, role, is_active FROM users;'`。
- `reference/known-gaps.md` 新增：AUTH_SECRET 未注入（compose 未配置）→ 签名密钥每次启动随机生成 → 容器重启全员 session 失效、多实例互不认 token；修法是 compose 注入固定 `AUTH_SECRET`。
- 通用排障经验（供 recorder 判断落点，候选 `guides/` 或现有 reference）：① HTTP 直访/去 TLS 类部署决策须全局排查 `NODE_ENV === "production"` 隐含的 HTTPS 假设（Secure cookie、HSTS、redirect 等）；② 4xx 报错先判断是异常还是业务正常分支，业务分支日志无报错、应查数据与客户端侧（DevTools）。
- Windows 开发环境经验（候选并入 `reference/ci-and-tooling.md` 或 startup 工具说明）：nvm4w 下 pnpm .cmd shim 报 `'node' 不是内部或外部命令` 时，绕过 shim 直跑 `node node_modules/typescript/lib/tsc.js --noEmit`、`node node_modules/prisma/build/index.js generate`。

## Follow-up

- recorder 按上述候选更新 `reference/gitlab-release-pipeline.md` 与 `reference/known-gaps.md`。
- 尽快在 docker-compose.yml 注入固定 `AUTH_SECRET`（修复重启 session 全失效隐患），随下个 tag 发版生效。
- 未来若做任何部署形态变更（如引入 HTTPS/nginx），先全局 grep `NODE_ENV === "production"` 与 secure/HSTS/redirect 相关代码，逐项确认假设是否仍成立；届时 `AUTH_COOKIE_SECURE` 应改回 "true" 或移除覆盖。
