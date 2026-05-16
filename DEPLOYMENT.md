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

## 本地部署

### 方式一：Docker Compose（推荐）

```bash
# 拉取并启动所有服务（PostgreSQL + Next.js）
docker compose up -d --build

# 应用启动后，运行 Prisma 数据库初始化（--skip-generate 因为 Prisma Client 已在镜像构建时生成）
docker compose exec app npx prisma db push --skip-generate

# 查看日志
docker compose logs -f app

# 健康检查
curl http://localhost:3000/api/health

# 停止
docker compose down
```

开发模式（热重载，挂载源码 + `prisma db push` 自启）：

```bash
docker compose --profile dev up -d
```

> Dockerfile 依赖 Next.js 的 `output: "standalone"` 输出（已在 `next.config.mjs` 中开启），
> 升级 Next.js 大版本时请确认该配置保留，否则 `COPY --from=builder /app/.next/standalone` 会失败。

### 方式二：手动部署

```bash
# 安装依赖
npm ci

# 生成 Prisma Client
npx prisma generate

# 初始化数据库
npx prisma db push

# 构建
npm run build

# 启动
npm start
```

## 测试环境部署

```bash
# 1. 配置测试数据库
cp .env.test.example .env.test
# 按需调整 DATABASE_URL

# 2. 安装依赖并构建
npm ci
npx prisma generate
npx prisma db push
npm run build

# 3. 启动（端口 3001）
PORT=3001 npm start
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
```

### Docker Compose 生产部署

编辑 `docker-compose.yml`，确保：
- `db` 服务使用强密码
- 通过 profiles 隔离 `app-dev`（默认不会启动）
- 挂载 PostgreSQL 数据卷到宿主机持久化

```bash
# 启动
docker compose up -d --build

# 运行迁移（--skip-generate 因为 Prisma Client 已在镜像构建时生成）
docker compose exec app npx prisma db push --skip-generate

# 健康检查
curl http://localhost:3000/api/health
```

### 云平台部署

BabelTower 是标准 Next.js 应用，可部署到任何支持 Node.js 的平台：

#### Vercel（推荐用于全托管）

1. 连接 GitHub 仓库
2. 设置环境变量 `DATABASE_URL`
3. 部署

#### 自建服务器（Ubuntu 示例）

```bash
# 安装 Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PostgreSQL
sudo apt-get install -y postgresql
sudo -u postgres createuser babeltower -P
sudo -u postgres createdb babeltower -O babeltower

# 部署应用
git clone https://github.com/itMrBoy/BabelTower.git
cd BabelTower
npm ci
npx prisma generate
npx prisma db push
npm run build

# 使用 PM2 管理进程
npm install -g pm2
pm2 start npm --name babeltower -- start
pm2 save
pm2 startup
```

## CI / 自动化

`.github/workflows/ci.yml` 共定义 6 个 Job，与 `package.json` 中的脚本一一对应：

| Job | 命令 | 失败信号 |
|------|------|----------|
| `lint` | `npm run lint` | ESLint 规则违规 |
| `typecheck` | `npx prisma generate` + `npm run typecheck` | TypeScript 类型错误（含 Prisma Client） |
| `prisma-validate` | `npx prisma validate` | Schema 语法错误 |
| `openapi-validate` | `npx @redocly/cli lint openapi/babeltower.v1.yaml` | OpenAPI 契约错误 |
| `test` | `npm test` （携带 postgres service） | 单元/集成测试失败 |
| `build` | `npm run build` | Next.js 生产构建失败、`output: "standalone"` 失效 |

### CI 中的 secret 注入

- `typecheck` / `prisma-validate` / `openapi-validate` / `build`：`DATABASE_URL` 只要存在即可，不必能连接。当前 workflow 中 `typecheck` 和 `prisma-validate` 不显式注入，依赖 Prisma 在 schema-only 操作下不强校验连通性；如果 Prisma 未来收紧此行为，请在对应 job 的 `env:` 中追加占位 URL（`build` job 已示范）。
- `test`：使用 GitHub Actions 提供的 `postgres:17-alpine` service container，连接串 `postgresql://babeltower:babeltower@localhost:5432/babeltower_test?schema=public`，与 `.env.test.example` 保持一致。
- 真实生产数据库 URL 必须存放在 **GitHub Secrets**，并通过 `secrets.PROD_DATABASE_URL`（或同名）注入到部署 job（当前 workflow 仅含 CI，部署 job 需另行追加）：
  ```yaml
  - run: npx prisma migrate deploy
    env:
      DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
  ```

## 数据库迁移策略

```bash
# 开发：Schema 变更后
npx prisma migrate dev --name describe_your_change

# 生产：应用迁移（不丢失数据）
npx prisma migrate deploy

# 紧急：直接推送（跳过迁移历史，仅限开发/测试）
npx prisma db push
```

## 健康检查

应用启动后通过以下端点验证：

```bash
# 健康检查（已实现于 src/app/api/health/route.ts）
curl http://localhost:3000/api/health

# 数据库连接验证
npx prisma db push
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

- 运行 `npx prisma generate`
- 确认 `prisma/schema.prisma` 文件存在

### Docker 构建失败：找不到 `.next/standalone`

```
ERROR: failed to compute cache key: ".next/standalone": not found
```

- `next.config.mjs` 必须设置 `output: "standalone"`，否则 `next build` 不会生成 `.next/standalone`
- 升级 Next.js 后请验证该配置仍然生效

### 端口冲突

```
Error: listen EADDRINUSE :::3000
```

- 修改 `PORT` 环境变量或停止占用端口的进程
