# BabelTower Technical Architecture

## 1. 技术选型

BabelTower 采用 Next.js 全栈一体架构：

- 前端：Next.js App Router + React Server Components + Client Components。
- 后端：Next.js Route Handlers 暴露 REST API。
- 数据库：PostgreSQL。
- ORM：Prisma。
- 文件处理：服务端 Parser 模块解析 JSON / properties，统一输出 Standard JSON。
- 导出：服务端 Exporter 模块将 Standard JSON 渲染回 JSON / properties。

选择 Next.js 的原因：

- 产品需要页面和 API 快速闭环，Next.js 适合 MVP 全栈一体交付。
- Prisma 与 PostgreSQL 生态成熟，便于维护 Dictionary、TaskSnapshot、任务历史。
- App Router 能把任务页、字典页和 API 契约放在同一代码库中，减少上下文切换。

## 2. 模块边界

```text
app/
  dictionary/          字典录入与搜索页面
  tasks/               任务清单、最近任务、历史任务
  translate/single/    单中文文件翻译页
  translate/dual/      中文 + 英文双文件翻译页
  api/                 OpenAPI 对应 Route Handlers

src/domain/
  standard-i18n/       Standard JSON 类型、flatten/unflatten
  parser/              JSON Parser、Properties Parser
  conflict/            冲突检测与相似度计算
  dictionary/          字典查询、写入、版本记录
  task/                任务、快照、保存、导出
  exporter/            JSON Exporter、Properties Exporter

prisma/
  schema.prisma        数据库模型

openapi/
  babeltower.v1.yaml   API 契约
```

## 3. 强制数据流

所有导入、同步字典、保存任务都必须遵守：

```text
Input (File) -> Parser -> Standard JSON -> Conflict Check -> Database
```

### 3.1 Input (File)

- 输入可以是 JSON 或 properties。
- 单文件模式只接收中文文件。
- 双文件模式接收中文和英文两个文件，格式必须一致。

### 3.2 Parser

- JSON Parser：遍历对象，抽取字符串 leaf value，使用点号 key path 形成稳定 key。
- Properties Parser：解析 key/value 行，处理基础转义，保留行顺序。
- Parser 不访问数据库，不做冲突检测。

### 3.3 Standard JSON

- 系统内唯一中间表达。
- 预览表、冲突检测、快照、导出都基于 Standard JSON。
- 详细结构见 `docs/standard-i18n.md`。

### 3.4 Conflict Check

- 所有 Dictionary 写入前必须执行。
- 检测 exact Chinese、normalized Chinese、similar Chinese 三类风险。
- 未解决的 blocking conflict 只能进入 TaskSnapshot，不能写入 Dictionary。

### 3.5 Database

- Dictionary 存储全局中英文字典，以中文内容唯一。
- TranslationTask 存储项目级翻译任务。
- TaskSnapshot 存储用户暂存和保存时的预览数据。
- DictionaryConflict 存储冲突检测结果和用户处理动作。

## 4. 数据模型原则

### 4.1 Dictionary

- 全局通用，不绑定项目。
- `chineseText` 是唯一索引，符合“中文为基准”的产品原则。
- `normalizedChinese` 用于检索和相似度初筛。
- 每次更新英文值都写入 DictionaryRevision，便于追溯。

### 4.2 ProductProject

- 项目是文件任务的归属边界。
- `currentTaskId` 指向最近一次可编辑任务。
- 旧任务仍保留，但进入只读历史列表。

### 4.3 TaskSnapshot

- 存储导入、暂存、保存时的完整预览状态。
- `standardDocuments` 保存解析后的标准结构。
- `previewRows` 保存表格当前编辑值。
- `conflictSummary` 保存冲突数量、原因、列表摘要。
- 快照按 `taskId + version` 递增，支持恢复。

## 5. 冲突检测协议

### 5.1 文本标准化

```text
normalizedChinese = NFKC(chineseText).trim().replace(consecutiveWhitespace, " ")
normalizedEnglish = NFKC(englishText).trim().replace(consecutiveWhitespace, " ").toLowerCase()
```

标准化不删除标点，避免把“保存？”和“保存！”误判为完全相同。

### 5.2 冲突类型

| 类型 | 条件 | 严重级别 | 默认处理 |
| --- | --- | --- | --- |
| `DUPLICATE_IDENTICAL` | 中文完全一致，英文也一致 | info | 不重复写入，提示已存在 |
| `EXACT_CHINESE_DIFF_ENGLISH` | 中文完全一致，但英文不同 | blocking | 阻止写入，必须用户选择是否更新 Dictionary |
| `SIMILAR_CHINESE` | 中文不完全一致，但相似度 >= 90% | warning | 弹窗提示，用户可忽略相似或编辑后重试 |

### 5.3 相似度算法

MVP 使用两段式检测：

1. 候选召回：对 `normalizedChinese` 做包含、长度差、公共前缀和分词 trigram 召回。
2. 精排评分：使用 Jaro-Winkler 或 Levenshtein ratio，分值范围 0 到 1。

当 `score >= 0.9` 时生成 `SIMILAR_CHINESE` 冲突。若后续启用 PostgreSQL `pg_trgm`，可在迁移中为 `normalized_chinese` 增加 trigram GIN 索引提升召回性能。

### 5.4 用户处理动作

| 动作 | 适用类型 | 结果 |
| --- | --- | --- |
| `KEEP_EXISTING` | exact conflict | 保持 Dictionary，不写入候选英文 |
| `UPDATE_DICTIONARY` | exact conflict | 用户授权后更新 Dictionary 英文，并记录 revision |
| `IGNORE_SIMILAR` | similar conflict | 允许候选作为新 Dictionary 写入 |
| `EDIT_ROW` | all | 用户修改中文或英文后重新检测 |

## 6. 任务保存协议

### 6.1 单中文文件模式

- 保存前校验：`key`、`zhText`、`enText` 均必填。
- 导出 zh 文件取 `zhText`。
- 导出 en 文件取 `enText`。
- 同步字典时以 `zhText` 为中文基准，以 `enText` 为英文值。

### 6.2 中文 + 英文双文件模式

- 保存前校验：`key`、`zhText` 必填；`enText` 与 `dictionaryText` 至少一个必填。
- 导出 zh 文件取 `zhText`。
- 导出 en 文件取 `dictionaryText || enText`。
- 同步字典时优先使用 `dictionaryText || enText` 作为英文值。

## 7. API 设计原则

- API 以任务为中心，导入即创建 Task 和首个 TaskSnapshot。
- 编辑表格只更新快照，不直接写 Dictionary。
- 保存任务时，按请求参数决定是否同步 Dictionary。
- 导出 API 不产生 Dictionary 写入，只根据快照生成文件。
- 所有返回值都包含 `requestId`，便于排查。

## 8. 后续实现拆分建议

1. Parser 与 Standard JSON：先实现纯函数和单元测试。
2. Prisma 与 Repository：完成 Dictionary、TaskSnapshot、Task 查询写入。
3. Conflict Engine：完成 exact conflict 与 similarity conflict。
4. API Route Handlers：按 OpenAPI 落地。
5. 前端页面：先做任务导入与预览，再做字典页和历史页。
6. 导出模块：最后接入 JSON / properties 渲染和 zip 下载。
