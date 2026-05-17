# BabelTower - 多阶段构建
# Stage 1: 安装依赖
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: 构建应用
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: 运行
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
# Prisma 生成文件在 builder 阶段创建，必须从 builder 复制
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 安装与项目兼容的 Prisma CLI（用于容器内执行迁移/推送）
RUN npm install -g prisma@^6.7.0

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
