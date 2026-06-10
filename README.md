# BabelTower

i18n 文案字典库，复用多端项目中的语料资产。

## 名称由来

**BabelTower（巴别塔）** 典出《圣经·创世记》：人类本说同一种语言，齐心建造一座通天高塔；神为阻止，变乱了他们的语言，使彼此无法沟通，高塔就此荒废——「巴别塔」由此成为**语言隔阂**的永恒象征。

本项目取此典却反其意而行：当多语言、多端、多任务的翻译资产各自为政、重复且不一致时，BabelTower 用一张**以中文为基准的全局复用字典**消弭这种隔阂，把"被变乱的语言"重新整合为可追溯、可复用的共同语料——让协作不再因语言而中断。

## 架构结论

- 技术栈：Next.js 全栈一体化（App Router + Route Handlers）+ Prisma + PostgreSQL。
- 核心数据流：Input (File) -> Parser -> Standard JSON -> Conflict Check -> Database。
- 字典原则：Dictionary 全局复用，以中文内容为唯一基准；项目只管理文件与翻译任务。
- 暂存原则：TaskSnapshot 存储每次导入、编辑、暂存、保存时的预览数据，项目首页只保留最近一次可编辑任务，历史任务只读。
- 鉴权：基于 HttpOnly Cookie（`babeltower_session`，HMAC-SHA256 签名）的会话鉴权，在各 Route Handler 内通过 `requireUser` / `requireAdmin` 校验；业务接口默认要求登录，用户管理与系统维护要求 `ADMIN` 角色。

## 交付物

- `docs/prd.md`：MVP PRD、页面流程、验收标准、UI 风格候选。
- `docs/architecture.md`：系统架构、模块边界、冲突检测协议、任务快照策略。
- `docs/standard-i18n.md`：JSON / Properties / TS 互转的 Standard JSON 中间结构。
- `prisma/schema.prisma`：数据库模型定义，包含 Dictionary 与 TaskSnapshot。
- `openapi/babeltower.v1.yaml`：OpenAPI 3.1 API 契约（含 cookie 鉴权定义，`redocly lint` 校验通过）。
- `src/domain/`：JSON / Properties / TS Parser、Standard JSON、冲突检测、导出、保存 Diff 核心引擎。
- `src/lib/`：Prisma 客户端、鉴权、API 辅助、字典同步预分类（`dictionary-sync.ts`）、内存降级存储等共享逻辑。
- `src/app/api/`：Next.js Route Handlers，覆盖字典、项目、任务、暂存、保存、导出。
- `tests/`：核心引擎、QA 边界、冲突修复、快照恢复、1000 行性能测试，以及 API 路由契约测试（`settings-maintenance`、`dictionaries-search`）。
- `DEPLOYMENT.md` / `docker-compose.yml` / `.github/workflows/ci.yml`：部署与 CI 基线。

## 去重字典管理哲学

BabelTower 的核心机制是 **以中文为主键的全局复用字典**，目的是消除多端、多任务重复翻译造成的不一致和返工：

1. **Dictionary 全局复用**：所有翻译条目最终都落到一张 `dictionaries` 表，中文内容唯一（`chinese_hash` + `chinese_text` 双唯一约束）。一处更新即处处复用。
2. **冲突检测三档**：导入新任务时，引擎会对每行中文与字典进行三种比对：
   - `DUPLICATE_IDENTICAL`：完全相同（中文 + 英文一致），自动复用。
   - `EXACT_CHINESE_DIFF_ENGLISH`：中文相同但英文不同，进入 **BLOCKING** 冲突，必须人工裁决（保留旧译 / 用新译覆盖字典）。
   - `SIMILAR_CHINESE`：中文相似度高于阈值，进入 **WARNING**，提示译者注意一致性。
3. **BLOCKING 必须先裁决**：只要任务中还存在未解决的 BLOCKING 冲突，前端「同步到 Dictionary」按钮即禁用，服务端 save 接口也会拒绝写入，确保不会把未裁决的冲突译文落库。
4. **任务只是中转**：`TranslationTask` 不持有翻译结果，只持有引用与快照。真正"翻译资产"沉淀在 `dictionaries`。
5. **快照与回滚**：每次导入、编辑、保存都会生成 `TaskSnapshot`，保留 `standardDocuments` / `previewRows` / `conflictSummary`，支持任意时刻回看与回滚。
6. **去重审计**：`DictionaryRevision` 记录每次字典英文的修改，并附带 `reason`，所有覆盖性更新都可追溯。

### 操作指南

| 场景 | 操作 | 命中机制 |
|------|------|----------|
| 新增一份中文文件 | 上传 → 引擎自动比对字典 | 显示 `DUPLICATE_IDENTICAL` 自动复用，`EXACT_CHINESE_DIFF_ENGLISH` 转人工 |
| 修复历史错译 | 重新导入含正确英文的中文 → 在冲突裁决时选「用新译覆盖字典」并填写 `reason` | 写入 `DictionaryRevision`，下次导入自动使用新值（字典页当前为只读，不支持就地编辑） |
| 控制冲突阈值 | 调整 `SIMILAR_CHINESE` 相似度阈值 | 影响 `WARNING` 数量；越严格越多打断，越宽松越少提示 |
| 批量回滚一次保存 | 在任务页选择历史 `TaskSnapshot` → 恢复 | 重写当前可编辑任务的状态 |

### 冲突裁决后的同步规则

「同步 Dictionary」不是直接按冲突页的按钮文字决定是否覆盖字典，而是以冲突处理后进入预览行的最终英文值（`PreviewRow.translatedValue`）为准：同步时按中文命中字典，最终英文值与现有字典值相同则跳过，不同则更新并写入 `DictionaryRevision`。

- 全部选择「使用字典值」：最终英文值等于字典库已有英文，同步时跳过，保留字典库。
- 全部选择「使用当前值」：最终英文值等于本次新导入英文，同步时覆盖字典库。
- 部分选择字典值、部分选择当前值：只更新最终采用当前/新导入值的条目，采用字典值的条目保持不变。

> `SIMILAR_CHINESE` 这类相似中文 WARNING 通常不是覆盖同一中文旧译，而是按最终预览行内容参与新增或同步。

## 本地启动

最简启动（Docker Compose 一键起 PostgreSQL + Next.js）：

```bash
docker compose up -d --build
docker compose exec app prisma db push   # 容器内无 pnpm，使用镜像全局安装的 prisma
curl http://localhost:3000/api/health
```

> 数据库迁移后需执行 seed 创建初始管理员（`pnpm exec prisma db seed`）；默认账号 **admin / Snow@123**，首次登录后请及时在账号设置中修改密码。数据库不可用时系统会降级到内存存储并内置同一账号。

### 手动方式（不使用 Docker 跑应用）

应用本体在宿主机跑，但**数据库仍建议用容器**。首次启动按以下顺序：

```bash
pnpm install                 # 安装依赖（postinstall 会自动 prisma generate）
cp .env.example .env         # 准备环境变量
pnpm db:up                   # 1. 先起容器数据库（postgres:17，映射 127.0.0.1:5432）
pnpm db:push                 # 2. 同步 schema 到数据库
pnpm exec prisma db seed     # 3. 首次必须手动初始化账号：创建管理员 admin / Snow@123
pnpm dev                     # 4. 启动开发服务器
```

> **首次启动务必先起数据库**：`pnpm db:up` 后容器需几秒才 ready（compose 已配 `pg_isready` 健康检查），可用 `pnpm db:ps` 确认状态再 `db:push`。若库未就绪直接启动，应用会临时降级到内存存储。

### 两个启动脚本的区别

| 命令 | 行为 | 适用场景 |
|------|------|----------|
| `pnpm dev` | 仅启动 Next.js，`DATABASE_URL` 固定指向 `127.0.0.1:5432`；**假设数据库已在运行** | 数据库已经起好（已 `db:up` 或本机已有 PG）时的日常开发 |
| `pnpm dev:db` | 等价 `docker compose up -d db && next dev`，**自动先拉起容器数据库**再启动应用 | 一条命令完成「起库 + 起应用」，省去手动 `db:up` |

> `pnpm dev` 的 `DATABASE_URL` 与 `.env.example`、docker-compose 的 `db` 端口一致（5432）。

### 常用数据库脚本

| 命令 | 说明 |
|------|------|
| `pnpm db:up` / `pnpm db:down` | 启动 / 停止容器数据库 |
| `pnpm db:ps` | 查看数据库容器状态 |
| `pnpm db:push` | 将 Prisma schema 同步到数据库（开发用） |
| `pnpm db:generate` | 生成 Prisma Client（`postinstall` 已自动执行） |
| `pnpm db:studio` | 启动 **Prisma Studio**，浏览器可视化预览/编辑数据库数据（默认 http://localhost:5555） |
| `pnpm exec prisma db seed` | 初始化/重置内置管理员账号 admin / Snow@123 |

> 本项目统一使用 **pnpm**（`packageManager: pnpm@10.33.2`），仅保留 `pnpm-lock.yaml`，请勿使用 npm/yarn。

> 环境模板说明：仅 `.env.example` 一份（本地开发，与 docker-compose 默认凭据匹配）。
> 测试的 `DATABASE_URL` 由 CI workflow `env:` 直接注入；生产环境变量全部写在 `docker-compose.yml` 的 `environment:` 块，**不存在** `.env.test` / `.env.prod` 文件。

完整部署、CI、secret 注入说明见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。

## 验证命令

```bash
pnpm lint            # ESLint
pnpm typecheck       # tsc --noEmit（需先 prisma generate）
pnpm test            # vitest run
pnpm build           # Next.js 生产构建（Linux/Docker 下启用 output: "standalone"）
pnpm db:validate     # Prisma schema 校验
pnpm openapi:validate # OpenAPI 契约校验（redocly lint）
```

`db:validate` / `db:generate` 需要 `DATABASE_URL` 环境变量存在（无需可连通），本地直接复用 `.env.example` 中的连接串即可。
