# BabelTower 部署指南

## 环境变量配置

### 最小必需变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串（Prisma 通过 `env("DATABASE_URL")` 注入） | `postgresql://user:pass@host:5432/db?schema=public` |
| `NODE_ENV` | 运行环境，影响 Prisma 日志级别 | `development` / `test` / `production` |
| `PORT` | 应用端口（默认 3000） | `3000` |
| `AUTH_COOKIE_SECURE` | session cookie 的 `Secure` 属性开关，未设置时生产默认 `true`。**当前 HTTP 直访部署必须设 `false`**（否则浏览器丢弃 cookie，登录后接口一律 401「请先登录」）；引入 HTTPS 后改回 `true` | `false` |

仓库内仅保留一份模板 `.env.example`（本地开发用，与 docker-compose 默认凭据一致）：

```bash
# 本地开发
cp .env.example .env
```

> ⚠️ `.env` 等实际文件已在 `.gitignore` 中，不要提交。
>
> **不存在 `.env.test` / `.env.prod` 文件**：测试的 `DATABASE_URL` 由 CI workflow `env:` 直接注入；
> 生产环境变量全部写在 `docker-compose.yml` 的 `environment:` 块，随 GitLab tag 流水线部署生效，
> 没有任何机制会读取宿主机上的 env 文件。

> 📦 本项目统一使用 **pnpm**（`packageManager: pnpm@10.33.2`），仓库仅保留 `pnpm-lock.yaml`。
> 所有命令请使用 pnpm；如未安装可执行 `corepack enable`，让 Node 24 自带的 corepack 按 `package.json` 固定的版本启用 pnpm。

## 本地部署

### Docker Compose

```bash
# 拉取并启动所有服务（PostgreSQL + Next.js）
docker compose up -d --build

# 应用启动后，运行 Prisma 数据库初始化
# 注：standalone 运行镜像内不含 pnpm，容器里使用全局安装的 prisma CLI；
#     --skip-generate 因为 Prisma Client 已在镜像构建时生成
docker compose exec app prisma db push --skip-generate

# 查看日志
docker compose logs -f app

# 健康检查
curl http://localhost:3000/api/health

# 停止
docker compose down
```

常用日志命令：

```bash
# 最近 200 行应用日志
docker compose logs --tail=200 app

# 持续跟踪最近 200 行应用日志
docker compose logs -f --tail=200 app

# 同时查看应用和数据库日志
docker compose logs -f app db
```

> 初始管理员账号 **admin / Snow@123**：如需落库，可在宿主机连同一数据库执行 `pnpm exec prisma db seed`；
> 数据库不可用时系统会自动降级到内存存储并内置同一账号。首次登录后请尽快修改密码。

开发模式（热重载，挂载源码 + `prisma db push` 自启，profile=dev）：

```bash
# 必须点名 app-dev：app 与 app-dev 都绑 3000 端口，不指定服务名会同时启动两者而端口冲突
docker compose --profile dev up -d app-dev
```

> Dockerfile 依赖 Next.js 的 `output: "standalone"` 输出（已在 `next.config.mjs` 中针对 Linux/Docker 开启），
> 升级 Next.js 大版本时请确认该配置保留，否则 `COPY --from=builder /app/.next/standalone` 会失败。

## 生产环境部署

> **生产唯一部署路径 = GitLab tag 流水线 + Docker Compose**（见下方「CI / 自动化」）。
> **永远不存在宿主机直接跑运行命令**（`pnpm build` / `pnpm start` / PM2 等）的部署形态，
> 也不使用 Vercel 等云平台托管。服务器日志一律以 `docker compose logs -f app` 为准。

部署机上由流水线 deploy job 执行的核心动作等价于：

```bash
# 启动（复用 build 阶段镜像，不带 --build；永不 down -v）
docker compose up -d db app

# 同步表结构（standalone 镜像内用全局 prisma；--skip-generate 因为 Client 已在构建时生成）
docker compose exec app prisma db push --skip-generate

# 健康检查
curl http://localhost:3000/api/health
```

`docker-compose.yml` 注意事项：
- `db` 服务使用强密码
- `app-dev` 通过 `profiles: [dev]` 隔离（默认不会启动）
- 挂载 PostgreSQL 数据卷到宿主机持久化

## CI / 自动化

### 生产发版：GitLab tag 流水线

生产发版走自建 GitLab（git.snowsse.cn）的 `.gitlab-ci.yml` 流水线：

- 仅人工打规范版本号 tag `vX.Y.Z` 触发，平时 push / MR 不跑；CI 修复需打新 tag 验证（retry 旧 tag 跑的是旧 yaml）。
- 三阶段 check → build → deploy **全自动**（build 成功后 deploy 自动执行）；仅 `seed_admin` 保留手动（首次发版后在 GitLab UI 点一次，初始化管理员）。
- 阶段细节、runner 宿主机环境清单见 `llmdoc/reference/gitlab-release-pipeline.md`。

**部署后访问形态（有意决策，勿"补"nginx 配置）**：应用通过 IP+端口直访 `http://10.2.0.105:3000`，不经 nginx、不占宿主机 80 默认站点；后续多应用按端口区分，需要 TLS/域名分流时再引入反向代理。

### 日常质量 CI：GitHub Actions

`.github/workflows/ci.yml` 共定义 6 个 Job，统一通过 pnpm 执行（`pnpm/action-setup` + `actions/setup-node@v4`（Node 24，`cache: pnpm`），每个 job 先 `pnpm install --frozen-lockfile`）：

| Job | 命令 | 失败信号 |
|------|------|----------|
| `lint` | `pnpm lint` | ESLint 规则违规 |
| `typecheck` | `pnpm exec prisma generate` + `pnpm typecheck` | TypeScript 类型错误（含 Prisma Client） |
| `prisma-validate` | `pnpm exec prisma validate` | Schema 语法错误 |
| `openapi-validate` | `pnpm openapi:validate`（`redocly lint`） | OpenAPI 契约错误 |
| `test` | `pnpm exec prisma generate` + `pnpm test`（携带 postgres service） | 单元/集成测试失败 |
| `build` | `pnpm exec prisma generate` + `pnpm build` | Next.js 生产构建失败、`output: "standalone"` 失效 |

### CI 中的 secret 注入

- workflow 顶层 `env:` 已注入占位 `DATABASE_URL`，供 `pnpm install` 的 postinstall（`prisma generate`）及 schema-only 操作使用，无需真实连通。
- `test`：使用 GitHub Actions 提供的 `postgres:17-alpine` service container，连接串在 workflow `env:` 中直接注入（`postgresql://babeltower:babeltower@localhost:5432/babeltower_test?schema=public`），不依赖任何 env 文件。
- GitHub Actions **不承担部署职责**（生产发版只走 GitLab tag 流水线），无需在 GitHub Secrets 存放生产数据库 URL。

## 数据库迁移策略

```bash
# 开发：Schema 变更后
pnpm exec prisma migrate dev --name describe_your_change

# 生产：应用迁移（不丢失数据；在部署机容器内执行，镜像内为全局 prisma CLI）
docker compose exec app prisma migrate deploy

# 紧急：直接推送（跳过迁移历史，仅限开发/测试）
pnpm exec prisma db push
```

## 健康检查

应用启动后通过以下端点验证：

```bash
# 健康检查（已实现于 src/app/api/health/route.ts）
curl http://localhost:3000/api/health

# 数据库连接验证
pnpm exec prisma db push
```

## 常见问题

### 数据库连接失败

```
Error: Can't reach database server
```

- 检查 `DATABASE_URL` 格式是否正确
- 确认 PostgreSQL 服务已启动：`pg_isready`
- Docker 环境内使用服务名 `db` 而非 `localhost`

### Prisma Client 未生成

```
Error: @prisma/client did not initialize yet
```

- 运行 `pnpm exec prisma generate`
- 确认 `prisma/schema.prisma` 文件存在

### Docker 构建失败：找不到 `.next/standalone`

```
ERROR: failed to compute cache key: ".next/standalone": not found
```

- `next.config.mjs` 必须在 Linux/Docker 下设置 `output: "standalone"`，否则 `next build` 不会生成 `.next/standalone`
- 升级 Next.js 后请验证该配置仍然生效

### 端口冲突

```
Error: listen EADDRINUSE :::3000
```

- 修改 `PORT` 环境变量或停止占用端口的进程
