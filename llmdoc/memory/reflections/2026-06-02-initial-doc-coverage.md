---
name: 2026-06-02-initial-doc-coverage
description: 初始 llmdoc 文档编写后的反思：发现的多处文档与代码不一致
metadata:
  type: reflection
---

# 初始 llmdoc 文档编写反思

## 文档中的错误

### 1. API 契约文档与实现不一致

`architecture/api-contracts.md` 中描述的 API 响应格式与实际代码存在差异：

- **导出 API**：文档说"返回 JSON 对象（含文件内容字符串）"——当前实现确实如此，但 commit c82e162 曾短暂改为返回 `application/zip` 二进制流，后续又回退。文档未记录这一变更历史。
- **任务导入 API**：文档描述的响应为 `{ task, snapshot, previewRows, conflictSummary, dictionaryHits }`，但实际代码（`tasks/route.ts`）确实返回这些字段，这与文档一致。commit c82e162 曾精简为 `{ task, snapshot }`，后续恢复。
- **验证 API**：文档说返回 `{ valid, validationErrors, unresolvedBlocking }`，但实际代码确实如此。commit c82e162 曾改为 `{ valid, errors }`，后续恢复。

**根因**：在编写文档时，代码经历了来回变更，文档捕获了最终状态，但未记录变更历史。

### 2. 状态管理模式描述过时

`overview/project-overview.md` 和 `must/project-context.md` 均描述 `current-task.ts` 使用 `localStorage + CustomEvent` 机制，但实际代码已改为**内存变量 + `Set` 监听器**的发布订阅模式。

### 3. 降级存储文档不完整

`architecture/data-model.md` 中 local-store 的函数列表不完整，缺少大量新增函数（`upsertLocalDraftRows`, `getLocalCurrentRows`, `initializeLocalDraftRowsFromSnapshot`, `resolveLocalConflicts`, `summarizeLocalConflictCounts`, `updateLocalSnapshotConflictSummary`, `listLocalTaskConflicts`, `clearLocalStore` 等）。

### 4. 冲突检测性能描述过时

`architecture/domain-engine.md` 和 `must/data-flow.md` 均描述冲突检测为"O(n*m) 双重循环"，但实际代码已优化：
- 引入 `PreparedEntry` 预处理
- 使用 `exactExistingByChinese` Map 将精确匹配降为 O(n+m)
- 相似匹配仅对非精确匹配项执行

### 5. 文件格式支持不完整

`must/project-context.md` 中描述的 SourceFormat 为 `'json' | 'properties'`，但实际已扩展为 `'json' | 'properties' | 'ts'`。多处文档未提及 TS 格式支持。

## 缺失的文档

### 1. TaskDraftRow 模型

`prisma/schema.prisma` 中新增了 `TaskDraftRow` 模型，但 `architecture/data-model.md` 未记录。该模型是行级草稿编辑的核心。

### 2. DraftRows 数据流

`must/data-flow.md` 未描述 draftRows 的完整数据流：
- 用户编辑行 -> PATCH /api/tasks/{id}/rows -> upsert taskDraftRow
- 创建快照时 -> 优先读取 draftRows -> 回退到 snapshot.previewRows
- 导出/验证/保存时 -> 同样优先 draftRows

### 3. annotateConflictLevels 函数

`architecture/domain-engine.md` 未记录 `src/lib/standard.ts` 中的 `annotateConflictLevels` 函数，该函数将冲突摘要合并到预览行的 `conflictLevel` 字段。

### 4. TS 解析器

`architecture/domain-engine.md` 的解析器章节未记录 `src/domain/parser/ts-parser.ts`。

### 5. 快照历史页面

`overview/project-overview.md` 已记录 `/snapshots` 页面，但功能描述较简略。

## 教训

1. **代码变更频繁时文档易过时**：commit c82e162 对 API 契约做了大量变更，后续提交又部分回退。编写文档时应确认最终状态。
2. **Prisma schema 是文档的关键来源**：TaskDraftRow 模型的存在直接反映了架构变化，应优先检查 schema。
3. **local-store.ts 是降级架构的核心**：任何新增的数据库操作都应在 local-store 中有对应实现，文档应同步更新。
4. **性能优化应及时反映到文档**：冲突检测的优化改变了复杂度特征，文档中的性能表格需要更新。

## 提升候选

1. **冲突检测优化**：`PreparedEntry` + `exactExistingByChinese` 的优化模式值得提升到 `guides/` 作为"如何优化 O(n*m) 算法"的参考。
2. **降级存储设计模式**：local-store 的完整设计（全局单例、函数镜像、类型映射）值得提升到 `guides/` 作为降级架构参考。
3. **草稿行数据流**：draftRows 的读写模式（数据库优先、快照回退）是核心数据流，应明确记录在 `must/data-flow.md` 中。
