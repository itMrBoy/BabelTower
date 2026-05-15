# BabelTower

i18n 文案字典库，复用多端项目中的语料资产。

## 架构结论

- 技术栈：Next.js 全栈一体化（App Router + Route Handlers）+ Prisma + PostgreSQL。
- 核心数据流：Input (File) -> Parser -> Standard JSON -> Conflict Check -> Database。
- 字典原则：Dictionary 全局复用，以中文内容为唯一基准；项目只管理文件与翻译任务。
- 暂存原则：TaskSnapshot 存储每次导入、编辑、暂存、保存时的预览数据，项目首页只保留最近一次可编辑任务，历史任务只读。

## 交付物

- `docs/prd.md`：MVP PRD、页面流程、验收标准、UI 风格候选。
- `docs/architecture.md`：系统架构、模块边界、冲突检测协议、任务快照策略。
- `docs/standard-i18n.md`：JSON / Properties 互转的 Standard JSON 中间结构。
- `prisma/schema.prisma`：数据库模型定义，包含 Dictionary 与 TaskSnapshot。
- `openapi/babeltower.v1.yaml`：OpenAPI 3.1 API 契约。
- `src/domain/`：JSON / Properties Parser、Standard JSON、冲突检测、导出、保存 Diff 核心引擎。
- `src/app/api/`：Next.js Route Handlers，覆盖字典、项目、任务、暂存、保存、导出。
- `ui-design/`：HTML 原型、Pencil `.pen` 正稿与预览图。
- `tests/`：核心引擎、QA 边界、冲突修复、快照恢复和 1000 行性能测试。
- `DEPLOYMENT.md` / `docker-compose.yml` / `.github/workflows/ci.yml`：部署与 CI 基线。

## 本地运行

```bash
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

## 验证命令

```bash
npm run typecheck
npm test
npm run build
npm run db:validate
```

`db:validate` / `db:generate` 需要 `DATABASE_URL`，本地可先使用 `.env.example` 中的 PostgreSQL 连接模板。
