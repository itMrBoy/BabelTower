# BabelTower 主线收口报告

时间：2026-05-15
负责人：李云龙团长

## 收口结论

已把各独立 workdir 的可用产物合回主线目录：

`C:\Users\10378\multica_workspaces_desktop-api.multica.ai\adabcd56-574a-404e-a15f-ad9cef20187b\bd0e1c6a\workdir\BabelTower`

主线现在不再只是规划文档，而是可构建的 Next.js + Prisma + TypeScript 工程基线，保留强制数据流：

`Input(File) -> Parser -> Standard JSON -> Conflict Check -> Database`

## 合入来源

- UI：`0af60f87\workdir\BabelTower\ui-design`
  - HTML 交互原型：`ui-design/prototypes/all-pages.html`
  - Pencil 正稿：`ui-design/pencil/*.pen`
  - 设计系统与组件方案：`ui-design/design-system.md`、`ui-design/component-architecture.md`
- 核心引擎：`c2de2609\workdir\BabelTower\src\domain`
  - JSON / Properties Parser
  - Standard JSON 类型与工具
  - 中文基准冲突检测
  - JSON / Properties 导出器
  - 保存、Diff、授权逻辑
- QA：`b58e2561\workdir\BabelTower\tests`
  - 1000 行导入性能、properties 边界、冲突修复流、快照恢复、表格性能
- DevOps：`5efb72ba\workdir\BabelTower`
  - Dockerfile、docker-compose、部署文档、CI 基线、环境变量模板
- 主线规划：保留并更新 `README.md`、`docs/`、`prisma/schema.prisma`、`openapi/babeltower.v1.yaml`

## 本次主线新增重点

- `package.json` / `tsconfig.json` / `vitest.config.ts` / `next.config.mjs`：统一工程配置。
- `src/app/api/*`：主线 API Route Handlers，覆盖健康检查、字典、项目、任务导入、行更新、快照、历史、校验、保存、导出。
- `src/domain/conflict/conflict-detector.ts`：已从“按 key 比对”修正为“按中文基准全局比对”，满足中文一致但英文不同阻断、中文相似度 >= 90% 告警。
- `openapi/babeltower.v1.yaml`：将 Windows/Next.js 不可落地的 `/dictionaries/conflicts:check` 收口为 `/dictionaries/conflicts`。
- `.gitignore`：排除 `node_modules/`、`.next/`、构建缓存和真实 `.env`。

## 验证结果

已在主线目录执行：

- `npm install`：完成，生成 `package-lock.json`。
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/babeltower npm run db:validate`：通过。
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/babeltower npm run db:generate`：通过。
- `npm run typecheck`：通过。
- `npm test`：13 个测试文件、138 个测试全部通过。
- `npm run lint`：通过。
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/babeltower npm run build`：通过，生成 14 条页面/API 路由。
- `git diff --check`：通过。

## 后续调度口径

1. 后端继续做真实数据库联调和 OpenAPI 逐接口 curl 验证。
2. 前端继续把 `ui-design` 资产落成 Next.js 页面和组件，不再等待 Pencil。
3. QA 等后端接口和前端页面落主线后，基于当前 `tests/` 做真实主线回归。
4. DevOps 基于当前可构建主线复核 Docker、CI、环境变量和部署文档。

## 风险与边界

- 当前 API 已构建通过，但尚未连接真实 PostgreSQL 实例跑端到端导入/保存请求。
- `/api/tasks/{id}/export` 当前返回文件内容 JSON map，后续如严格按 OpenAPI 的 `application/zip`，需补 zip 打包实现。
- ESLint 当前以 typecheck/build/test 兜底，未启用 Next.js 官方插件；后续可单独补全 `typescript-eslint` 和 Next flat config。
