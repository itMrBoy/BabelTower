---
name: startup
description: BabelTower 启动阅读顺序与快速启动命令
metadata:
  type: startup
---

# 启动阅读顺序

按以下顺序阅读 MUST 文档：

1. [`must/project-context.md`](must/project-context.md) — 了解项目是什么、核心术语、关键架构决策
2. [`must/data-flow.md`](must/data-flow.md) — 理解完整数据流、模型关系、状态转换

## 快速启动命令

```bash
# 安装依赖
pnpm install --frozen-lockfile

# 生成 Prisma Client
pnpm exec prisma generate

# 同步数据库 schema（开发环境）
pnpm exec prisma db push

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 完整 CI 检查
pnpm ci:check
```

## Docker 启动

```bash
# 启动全部服务（生产模式）
docker compose up -d --build

# 同步数据库
docker compose exec app pnpm exec prisma db push --skip-generate

# 健康检查
curl http://localhost:3000/api/health

# 开发模式（热重载）
docker compose --profile dev up -d app-dev
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
DATABASE_URL=postgresql://babeltower:babeltower@localhost:5432/babeltower?schema=public
PORT=3000
NODE_ENV=development
```
