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

## 去重字典管理哲学

BabelTower 的核心机制是 **以中文为主键的全局复用字典**，目的是消除多端、多任务重复翻译造成的不一致和返工：

1. **Dictionary 全局复用**：所有翻译条目最终都落到一张 `dictionaries` 表，中文内容唯一（`chinese_hash` + `chinese_text` 双唯一约束）。一处更新即处处复用。
2. **冲突检测三档**：导入新任务时，引擎会对每行中文与字典进行三种比对：
   - `DUPLICATE_IDENTICAL`：完全相同（中文 + 英文一致），自动复用。
   - `EXACT_CHINESE_DIFF_ENGLISH`：中文相同但英文不同，进入 **BLOCKING** 冲突，必须人工裁决（保留旧译 / 用新译覆盖字典）。
   - `SIMILAR_CHINESE`：中文相似度高于阈值，进入 **WARNING**，提示译者注意一致性。
3. **任务只是中转**：`TranslationTask` 不持有翻译结果，只持有引用与快照。真正"翻译资产"沉淀在 `dictionaries`。
4. **快照与回滚**：每次导入、编辑、保存都会生成 `TaskSnapshot`，保留 `standardDocuments` / `previewRows` / `conflictSummary`，支持任意时刻回看与回滚。
5. **去重审计**：`DictionaryRevision` 记录每次字典英文的修改，并附带 `reason`，所有覆盖性更新都可追溯。

### 操作指南

| 场景 | 操作 | 命中机制 |
|------|------|----------|
| 新增一份中文文件 | 上传 → 引擎自动比对字典 | 显示 `DUPLICATE_IDENTICAL` 自动复用，`EXACT_CHINESE_DIFF_ENGLISH` 转人工 |
| 修复历史错译 | 在字典页直接编辑英文 → 填写 `reason` | 写入 `DictionaryRevision`，下次导入自动使用新值 |
| 控制冲突阈值 | 调整 `SIMILAR_CHINESE` 相似度阈值 | 影响 `WARNING` 数量；越严格越多打断，越宽松越少提示 |
| 批量回滚一次保存 | 在任务页选择历史 `TaskSnapshot` → 恢复 | 重写当前可编辑任务的状态 |

## 本地启动

最简启动（Docker Compose 一键起 PostgreSQL + Next.js）：

```bash
docker compose up -d --build
docker compose exec app npx prisma db push
curl http://localhost:3000/api/health
```

手动方式（不使用 Docker）：

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

> 环境模板说明：
> - `.env.example`：本地开发（与 docker-compose 默认凭据匹配）
> - `.env.test.example`：测试 / CI（与 ci.yml postgres service 凭据一致）
> - `.env.prod.example`：生产仅做变量清单，敏感值通过 secret 注入

完整部署、CI、secret 注入说明见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。

## 验证命令

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit（需先 prisma generate）
npm test            # vitest run
npm run build       # Next.js 生产构建（依赖 output: "standalone"）
npm run db:validate # Prisma schema 校验
```

`db:validate` / `db:generate` 需要 `DATABASE_URL` 环境变量存在（无需可连通），本地直接复用 `.env.example` 中的连接串即可。
