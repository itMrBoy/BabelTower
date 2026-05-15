# BabelTower 部署指南

## 环境变量配置

### 最小必需变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@host:5432/db` |
| `NODE_ENV` | 运行环境 | `development` / `test` / `production` |
| `PORT` | 应用端口（默认 3000） | `3000` |

### 环境模板

```bash
# 本地开发 (.env)
cp .env.example .env

# 测试环境
cp .env.test .env

# 生产环境（通过部署平台注入，不要提交到仓库）
# 参考 .env.prod 中的变量列表
```

## 本地部署

### 方式一：Docker Compose（推荐）

```bash
# 拉取并启动所有服务（PostgreSQL + Next.js）
docker compose up -d

# 运行数据库迁移
docker compose exec app npx prisma db push

# 查看日志
docker compose logs -f app

# 停止
docker compose down
```

开发模式（热重载）：

```bash
docker compose --profile dev up -d
```

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
cp .env.test .env
# 编辑 DATABASE_URL 指向测试数据库

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
  -e DATABASE_URL="postgresql://user:strongpass@db-host:5432/babeltower" \
  -e NODE_ENV=production \
  babeltower:latest
```

### Docker Compose 生产部署

编辑 `docker-compose.yml`，确保：
- `db` 服务使用强密码
- `app` 服务移除 `app-dev` 配置段或使用 profiles 隔离
- 挂载 PostgreSQL 数据卷到宿主机持久化

```bash
# 启动
docker compose up -d

# 运行迁移
docker compose exec app npx prisma db push

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

应用启动后可通过以下端点验证：

```bash
# 健康检查（需在代码中添加）
curl http://localhost:3000/api/health

# 数据库连接验证
npx prisma db push --preview-feature
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

### 端口冲突

```
Error: listen EADDRINUSE :::3000
```

- 修改 `PORT` 环境变量或停止占用端口的进程
