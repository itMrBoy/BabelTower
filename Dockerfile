# BabelTower - 多阶段构建
# Stage 1: 构建应用（安装全部依赖 + 生成 Prisma Client + next build）
FROM node:24-alpine AS builder
WORKDIR /app
# 启用 corepack 以使用 package.json 中固定的 pnpm 版本
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate
RUN pnpm build

# Stage 2: 运行
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# Prisma 生成文件在 builder 阶段创建，必须从 builder 复制；
# pnpm 布局下产物位于 .pnpm 虚拟存储内（根 node_modules 无 .prisma），
# 通配符兼容版本号变化，落到根 node_modules/.prisma 供运行时沿目录树向上解析
COPY --from=builder /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma ./node_modules/.prisma

# 安装与项目兼容的 Prisma CLI（standalone 产物内无 pnpm，容器内执行迁移/推送时用全局 prisma）
RUN npm install -g prisma@^6.7.0

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
