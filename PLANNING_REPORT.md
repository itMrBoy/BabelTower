# BabelTower 规划工作报告

## 1. 本次规划目标

本次规划围绕 BabelTower 新项目的 MVP 底座展开，目标是先把产品边界、技术架构、核心数据模型、文件转换协议和 API 契约定下来，保证后续开发可以按统一标准推进。

强制数据流已明确为：

```text
Input (File) -> Parser -> Standard JSON -> Conflict Check -> Database
```

## 2. 已完成事项

### 2.1 明确产品范围与 MVP 需求

已在 `docs/prd.md` 中完成 MVP PRD 定稿，主要包括：

- BabelTower 的产品定位：面向产品经理、前端工程师和 Java 工程师的 i18n 文案字典管理系统。
- MVP 目标：字典录入、字典搜索、单中文文件翻译、中文 + 英文双文件翻译、项目级任务管理、暂存与导出。
- 非目标范围：暂不做复杂权限、审批流、机器翻译自动生成、混合格式任务等。
- 页面与功能流程：字典页、单文件翻译页、双文件翻译页、任务清单、任务详情与历史任务。
- 验收标准：围绕导入、预览、暂存、保存、冲突检测、字典同步和导出结果定义。
- UI 方向候选：提供 3 套偏 AI 时代感的视觉风格供后续实现选择。

### 2.2 确定整体技术架构

已在 `docs/architecture.md` 中完成技术架构设计，主要结论：

- 采用 Next.js 全栈一体架构，使用 App Router + Route Handlers 承载页面与 REST API。
- 数据层采用 PostgreSQL + Prisma。
- 文件处理拆成 Parser、Standard JSON、Conflict Check、Exporter 等模块。
- 字典是全局复用资源，项目只负责文件任务归属与任务历史。
- TaskSnapshot 作为导入、暂存、保存和导出过程中的预览数据持久化载体。

### 2.3 设计 Standard JSON 中间结构

已在 `docs/standard-i18n.md` 中定义 JSON 与 properties 互转的统一中间表示，核心内容：

- `StandardI18nDocument`：保存文件格式、语言角色、条目列表和解析元信息。
- `StandardI18nEntry`：保存统一 key、keyPath、value、顺序、原始来源位置和异常标记。
- `PreviewRow`：作为任务页面的可编辑预览行结构，承载中文、英文、字典命中值、最终英文值与冲突状态。
- JSON 解析规则：遍历字符串 leaf value，以点号 key path 形成稳定 key。
- properties 解析规则：保留 key/value 行顺序，统一转换成 entries。
- 导出规则：Standard JSON 可以稳定渲染回 JSON 或 properties。

### 2.4 设计数据库 Schema

已在 `prisma/schema.prisma` 中完成 Prisma Schema，重点模型包括：

- `Dictionary`：全局字典表，以 `chineseText` 作为唯一索引，并保存 `normalizedChinese`、`englishText`、`normalizedEnglish`、标签、备注和使用次数。
- `DictionaryRevision`：记录字典英文值的每次变更，便于追溯。
- `ProductProject`：项目表，维护项目编码、名称和当前可编辑任务。
- `TranslationTask`：翻译任务表，记录任务模式、文件格式、源语言、目标语言、任务状态和最新版本。
- `TaskSnapshot`：任务快照表，存储 `standardDocuments`、`previewRows`、`conflictSummary` 和导出产物信息。
- `DictionaryConflict`：冲突检测结果表，记录冲突类型、严重级别、相似度、处理动作和处理人。

其中 `Dictionary` 已满足“中文内容唯一”的约束，`TaskSnapshot` 已满足“存储用户暂存的预览数据”的要求。

### 2.5 定义冲突检测协议

已在 `docs/architecture.md` 中定义冲突检测逻辑，关键规则：

- 写入 Dictionary 前必须先执行 Conflict Check。
- 当中文完全一致且英文一致时，标记为已存在，不重复写入。
- 当中文完全一致但英文不同，标记为 `EXACT_CHINESE_DIFF_ENGLISH`，默认阻断写入，必须由用户授权更新或保留旧值。
- 当中文相似度大于等于 90% 时，标记为 `SIMILAR_CHINESE`，默认阻断直接写入，允许用户忽略相似、编辑后重试或合并。
- 未解决的 blocking conflict 只能进入 TaskSnapshot，不能写入 Dictionary。

### 2.6 定义 API 契约

已在 `openapi/babeltower.v1.yaml` 中完成 OpenAPI 3.1 契约，覆盖：

- 字典创建、搜索与冲突预检。
- 项目创建、项目列表和项目详情。
- 单文件导入任务与双文件导入任务。
- 任务详情、任务暂存、任务保存。
- 任务导出。
- Standard JSON、PreviewRow、Conflict、TaskSnapshot 等核心 DTO。

### 2.7 补充仓库入口说明

已更新 `README.md`，作为项目根目录入口，说明：

- 技术栈选择。
- 核心数据流。
- 字典与任务边界。
- 暂存原则。
- 各规划文档与契约文件位置。

## 3. 当前交付物清单

| 文件 | 内容 |
| --- | --- |
| `README.md` | 项目入口说明、架构结论和交付物索引 |
| `docs/prd.md` | MVP PRD、页面流程、验收标准和 UI 风格候选 |
| `docs/architecture.md` | 技术架构、模块边界、数据流、冲突检测和快照策略 |
| `docs/standard-i18n.md` | JSON / properties 互转的 Standard JSON 中间结构 |
| `prisma/schema.prisma` | Prisma 数据库模型 |
| `openapi/babeltower.v1.yaml` | OpenAPI 3.1 REST API 契约 |
| `PLANNING_REPORT.md` | 本次规划工作报告 |

## 4. 已做校验

- 已执行 `git diff --check`，未发现空白字符类问题。
- 已对 OpenAPI YAML 进行解析校验。
- 已对 OpenAPI `$ref` 引用进行基础校验。

## 5. 后续建议

下一步可以进入 MVP 工程实现阶段，建议优先顺序：

1. 初始化 Next.js + Prisma 工程结构。
2. 按 `prisma/schema.prisma` 生成数据库迁移。
3. 先实现 Parser 与 Standard JSON 转换模块。
4. 实现 Dictionary 查询、写入和 Conflict Check。
5. 实现单文件翻译任务的导入、预览、暂存、保存和导出闭环。
6. 再补齐双文件翻译任务和任务历史。
