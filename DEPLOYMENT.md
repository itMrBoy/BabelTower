# BabelTower 部署指南

## 环境变量配置

### 最小必需变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串（Prisma 通过 `env("DATABASE_URL")` 注入） | `postgresql://user:pass@host:5432/db?schema=public` |
| `NODE_ENV` | 运行环境，影响 Prisma 日志级别 | `development` / `test` / `production` |
| `PORT` | 应用端口（默认 3000） | `3000` |

仓库内已经登记了三份模板，请按目标环境复制：

| 文件 | 用途 | 是否提交到仓库 |
|------|------|--------------|
| `.env.example` | 本地开发模板（与 docker-compose 默认凭据一致） | 是（模板，无敏感值） |
| `.env.test.example` | CI / 本地测试模板（与 ci.yml postgres service 凭据一致） | 是（模板） |
| `.env.prod.example` | 生产模板，仅列出变量清单，实际值通过 secret 注入 | 是（模板） |

```bash
# 本地开发
cp .env.example .env

# 本地跑测试 (vitest)
cp .env.test.example .env.test

# 生产部署：参考 .env.prod.example 列出的变量，由部署平台/CI secret 注入
```

> ⚠️ `.env`、`.env.test`、`.env.prod` 等实际文件已在 `.gitignore` 中，不要提交。

> 📦 本项目统一使用 **pnpm**（`packageManager: pnpm@10.33.2`），仓库仅保留 `pnpm-lock.yaml`。
> 所有命令请使用 pnpm；如未安装可执行 `corepack enable`，让 Node 24 自带的 corepack 按 `package.json` 固定的版本启用 pnpm。

## 本地部署

### 方式一：Docker Compose（推荐）

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

> 初始管理员账号 **admin / Snow@123**：如需落库，可在宿主机连同一数据库执行 `pnpm exec prisma db seed`；
> 数据库不可用时系统会自动降级到内存存储并内置同一账号。首次登录后请尽快修改密码。

开发模式（热重载，挂载源码 + `prisma db push` 自启，profile=dev）：

```bash
# 必须点名 app-dev：app 与 app-dev 都绑 3000 端口，不指定服务名会同时启动两者而端口冲突
docker compose --profile dev up -d app-dev
```

> Dockerfile 依赖 Next.js 的 `output: "standalone"` 输出（已在 `next.config.mjs` 中针对 Linux/Docker 开启），
> 升级 Next.js 大版本时请确认该配置保留，否则 `COPY --from=builder /app/.next/standalone` 会失败。

### 方式二：手动部署（宿主机）

```bash
# 安装依赖（仓库仅保留 pnpm-lock.yaml）
corepack enable                 # 如本机尚未启用 pnpm
pnpm install --frozen-lockfile

# 生成 Prisma Client（pnpm install 的 postinstall 已自动执行，此处可显式重跑）
pnpm exec prisma generate

# 初始化数据库
pnpm exec prisma db push

# 创建初始管理员（admin / Snow@123）
pnpm exec prisma db seed

# 构建
pnpm build

# 启动
pnpm start
```

## 测试环境部署

```bash
# 1. 配置测试数据库
cp .env.test.example .env.test
# 按需调整 DATABASE_URL

# 2. 安装依赖并构建
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma db push
pnpm build

# 3. 启动（端口 3001）
PORT=3001 pnpm start
```

## 生产环境部署

### Docker 单机部署

```bash
# 1. 构建镜像
docker build -t babeltower:latest .

# 2. 运行（通过环境变量注入生产配置）
docker run -d \
  --name babeltower \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:strongpass@db-host:5432/babeltower?schema=public" \
  -e NODE_ENV=production \
  babeltower:latest

# 3. 初始化数据库（容器内使用全局 prisma CLI）
docker exec babeltower prisma db push --skip-generate
```

### Docker Compose 生产部署

编辑 `docker-compose.yml`，确保：
- `db` 服务使用强密码
- `app-dev` 通过 `profiles: [dev]` 隔离（默认不会启动）
- 挂载 PostgreSQL 数据卷到宿主机持久化

```bash
# 启动
docker compose up -d --build

# 运行迁移（standalone 镜像内用全局 prisma；--skip-generate 因为 Client 已在构建时生成）
docker compose exec app prisma db push --skip-generate

# 健康检查
curl http://localhost:3000/api/health
```

### 云平台部署

BabelTower 是标准 Next.js 应用，可部署到任何支持 Node.js 的平台：

#### Vercel（推荐用于全托管）

1. 连接 GitHub 仓库（Vercel 会自动识别 `pnpm-lock.yaml` 并用 pnpm 安装）
2. 设置环境变量 `DATABASE_URL`
3. 部署

#### 自建服务器（Ubuntu 示例）

```bash
# 安装 Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# 启用 pnpm（Node 24 自带 corepack）
corepack enable

# 安装 PostgreSQL
sudo apt-get install -y postgresql
sudo -u postgres createuser babeltower -P
sudo -u postgres createdb babeltower -O babeltower

# 部署应用
git clone https://github.com/itMrBoy/BabelTower.git
cd BabelTower
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma db push
pnpm exec prisma db seed        # 创建初始管理员 admin / Snow@123
pnpm build

# 使用 PM2 管理进程
npm install -g pm2
pm2 start pnpm --name babeltower -- start
pm2 save
pm2 startup
```

## CI / 自动化

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
- `test`：使用 GitHub Actions 提供的 `postgres:17-alpine` service container，连接串 `postgresql://babeltower:babeltower@localhost:5432/babeltower_test?schema=public`，与 `.env.test.example` 保持一致。
- 真实生产数据库 URL 必须存放在 **GitHub Secrets**，并通过 `secrets.PROD_DATABASE_URL`（或同名）注入到部署 job（当前 workflow 仅含 CI，部署 job 需另行追加）：
  ```yaml
  - run: pnpm exec prisma migrate deploy
    env:
      DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
  ```

## 数据库迁移策略

```bash
# 开发：Schema 变更后
pnpm exec prisma migrate dev --name describe_your_change

# 生产：应用迁移（不丢失数据）
pnpm exec prisma migrate deploy

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
