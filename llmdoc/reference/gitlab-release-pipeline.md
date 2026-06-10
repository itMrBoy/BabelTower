---
name: gitlab-release-pipeline
description: 自建 GitLab tag 发版流水线（.gitlab-ci.yml）：仅 vX.Y.Z 触发、check→build→deploy 三阶段、shell executor 的 chown 归还所有权硬规则、飞书通知、runner 宿主机环境清单、生产唯一部署路径决策（tag 流水线 + Docker Compose，永不宿主机直跑/云平台）、生产 env 全在 docker-compose.yml environment 块不读 env 文件、HTTP 直访形态对 AUTH_COOKIE_SECURE 的要求与 seed_admin 漏点症状
metadata:
  type: reference
---

# GitLab 发版流水线与 Runner 宿主机环境

项目部署在自建 GitLab（git.snowsse.cn），生产发版由根目录 `.gitlab-ci.yml` 承担；GitHub Actions（`.github/workflows/ci.yml`）只做日常质量 CI，见 [`ci-and-tooling.md`](ci-and-tooling.md)。

## 触发规则

- 仅规范版本号 tag `vX.Y.Z` 触发（workflow rules 正则 `^v\d+\.\d+\.\d+$`），平时 push / MR 不跑。
- tag 由人工创建，CI 只消费 `$CI_COMMIT_TAG`，不自动打 tag。
- **CI/yaml 修复必须打新 tag 验证**：retry 旧 tag 跑的是旧 commit 上的旧 yaml，修复不生效且可能重新埋雷（2026-06-10 首发排障因此从 v0.1.0 一路打到 v0.1.2，见 `memory/reflections/2026-06-10-gitlab-ci-runner-pipeline-fix.md`）。

## Runner

- shell executor，注册在宿主机 sws-manager1（Ubuntu 24.04），job tag `babeltower`。
- 宿主机只需 docker（check 阶段在容器里跑 node，无需预装 node/pnpm）；`gitlab-runner` 用户须在 docker 组。

## 三阶段结构

| 阶段 | job | 内容 |
|------|-----|------|
| check | `check` | `docker run node:24-alpine` 容器内 `pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm typecheck`（注入占位 `CHECK_DATABASE_URL` 供 postinstall 的 prisma generate，无需真连库） |
| build | `build` | `docker compose build app`，并额外 `docker tag babeltower:${VERSION}`（版本号 tag 便于回滚追溯） |
| deploy | `deploy`（build 成功后**自动触发**） | `docker compose up -d db app`（不 `--build`，复用 build 阶段镜像；永不 `down -v`）→ `prisma db push --skip-generate` → `curl localhost:$APP_PORT/api/health` 健康检查 |
| deploy | `seed_admin`（手动，仅首次发版点一次） | `prisma db seed` 初始化 admin 账号（幂等、不改已有密码） |

**seed_admin 漏点症状**：首次发版后必须在 GitLab UI 手动点一次 seed_admin（它是流水线中唯一的手动 job，deploy 自动跑完不会带它）。漏点后登录返回 401「用户名或密码错误」且**应用日志无任何报错**——这是查不到用户的业务正常分支（`src/app/api/auth/login/route.ts`），不是异常，排查应查库而非查日志。确认命令：`docker compose -p babeltower exec db psql -U babeltower -d babeltower -c 'SELECT username, role, is_active FROM users;'`，结果为空即确认。seed 幂等，可放心重复触发。

## 硬规则：check 的 after_script 第一行 chown

check 用 `docker run -v $CI_PROJECT_DIR:/app` 挂载工作区，容器内 root 写入 `.pnpm-store/`、`node_modules/`；若不归还所有权，宿主机 `gitlab-runner` 用户删不掉这些文件，**下一个 job 的 git clean 直接 Permission denied 失败**（数万行权限告警还会撑爆 4MB 日志上限）。

- 修复模式（commit `4512898`）：check 的 `after_script` 第一行固定为
  `docker run --rm -v "$CI_PROJECT_DIR":/app node:24-alpine chown -R "$(id -u):$(id -g)" /app`
- 该行无论 job 成败都执行，**不可删除、不可挪到通知脚本之后**。已产生的 root 残留需一次性手动 `rm` 清理。
- 通用规则：shell executor 下，凡容器内写挂载卷的 job 都必须考虑 uid 归还。

## 飞书分阶段通知

- 各阶段 `after_script` 通过 YAML 锚点 `*feishu_notify_script_anchor` 复用同一段脚本：获取 tenant_access_token → 拉取多维表格人员列表 → 按「权限」字段筛选接收人 → 逐人发送卡片。
- check 仅失败时通知；build / deploy 成功失败均通知。
- 依赖宿主机 `jq`、`curl`（脚本含 apk/apt 兜底，但不应依赖兜底）。

## Runner 宿主机环境清单（新 runner 机器逐项核对后再注册）

1. `/etc/docker/daemon.json` 配 `registry-mirrors` 后 `systemctl restart docker`——Docker Hub 国内直连 `registry-1.docker.io` timeout（被墙）；公共加速器会失效，须配多个兜底（当前：`docker.1ms.run` / `docker.m.daocloud.io` / `docker.1panel.live` / `hub.rat.dev`）。
2. `apt-get install docker-compose-v2`——Ubuntu 源安装的 docker 不带 compose 插件，否则 `docker compose` 报 `unknown command`。
3. `jq`、`curl`——飞书通知脚本依赖。
4. `gitlab-runner` 用户加入 docker 组。

排障提示：拉镜像报错先分语义——`connection refused` 指向配置错误/防火墙 reject，`timeout` 指向被墙（走镜像源解决）。

## 部署访问形态与唯一部署路径

**生产唯一部署路径 = GitLab tag 流水线 + Docker Compose**（用户明确决策，2026-06-10）：

- 「永远也不存在宿主机直接跑运行命令的情况」——生产永远没有 `pnpm build` / `pnpm start` / PM2 / Vercel / `docker run` 单容器等部署形态。`DEPLOYMENT.md` 已据此删除「手动部署（宿主机）」「测试环境部署」「Docker 单机部署」「云平台部署」等章节，**有意删除，勿补回**。
- 本地开发不受影响，仍可宿主机 `pnpm dev`。
- 服务器日志一律 `docker compose logs -f app`。

**生产环境变量机制**：全部写在 `docker-compose.yml` app 服务的 `environment:` 块（`DATABASE_URL` / `NODE_ENV` / `PORT` / `AUTH_COOKIE_SECURE`），**没有任何机制读取宿主机 env 文件**；测试的 `DATABASE_URL` 由 GitHub Actions workflow `env:` 直接注入。仓库仅保留一份模板 `.env.example`（本地开发用：`prisma.config.ts` 的 `import "dotenv/config"` + next dev 自动加载 `.env`）；`.env.test.example` / `.env.prod.example` 系零引用误导文件，已删除，**勿重建**。

deploy 后通过 `http://10.2.0.105:3000`（`DEPLOY_HOST:APP_PORT`）IP+端口直访，不经 nginx——这是有意决策而非待补项，详见根目录 `DEPLOYMENT.md`「生产环境部署」与「CI / 自动化」。

**HTTP 直访（无 TLS）的代码侧前置条件**：必须设置 `AUTH_COOKIE_SECURE=false`（docker-compose.yml app 服务已设置）。`src/lib/auth.ts`（`sessionCookieOptions()`）在该变量未设置时生产默认 `secure: true`，而浏览器在非 HTTPS 下会**静默丢弃** Secure cookie——症状是登录 200 成功但后续所有鉴权接口 401「请先登录」，服务端日志无任何报错。DevTools 验证：login 响应的 Set-Cookie 行带黄色警告、Application → Cookies 中无 `babeltower_session`。将来引入 HTTPS 后应将该变量改回 `"true"` 或移除覆盖。
