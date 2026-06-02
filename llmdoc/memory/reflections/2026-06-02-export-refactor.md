---
name: 2026-06-02-export-refactor
description: 导出系统重构、保存 API 简化、properties 模板导出、品牌资源引入等大量变更的反思
metadata:
  type: reflection
---

# 导出系统重构与保存 API 简化反思

## 文档中的错误

### 1. 导出 API 响应格式完全变更

`architecture/api-contracts.md` 中描述的导出响应为 `{ files: { [filename]: content }, fileBaseName }`，但实际代码现在返回双文件：
- 源文件（`dictionaryPriority: false`）
- 翻译文件（`dictionaryPriority: true`，文件名通过 `buildTranslatedFilename` 自动推断）

实际响应为 `{ files: { 'zh-cn.json': '...', 'en-us.json': '...' }, fileBaseName }`。

### 2. Save API 行为完全变更

`architecture/api-contracts.md` 和 `must/data-flow.md` 均描述 save API 会：
- 创建 `kind=SAVED` 快照
- 更新 `task.status=SAVED, isEditable=false`
- 递增 `latestVersion`

但实际代码已改为：
- **不创建新快照**
- **不改变 task status/isEditable/latestVersion**
- **只更新 `dictionarySyncedAt`**
- 使用 `seenHashes` Set 跳过重复中文
- 英文相同则跳过（不更新 usageCount）

### 3. Rows API 不再自动创建快照

`must/data-flow.md` 描述 rows API 会创建 `AUTOSAVED` 快照，但实际代码改为：
- DRAFT 状态时写入 `taskDraftRow`
- SAVED 状态时直接 upsert `dictionary`
- **不再创建 AUTOSAVED 快照**

### 4. Properties 导出器文档过时

`architecture/domain-engine.md` 描述 properties 导出器为"逐行生成"，但实际已支持**基于原始模板的替换导出**：
- 解析器记录 `propertiesValueStart` 和 `propertiesValueEnd`
- 导出器通过 `exportWithTemplate` 直接替换模板中的值位置
- 保留原始格式、注释、空白

## 缺失的文档

### 1. `buildDualExportFiles` 和 `buildTranslatedFilename`

新增的导出文件构建逻辑未在任何文档中记录。

### 2. `export-validation.ts`

新增的中文错误消息模块未记录。

### 3. `dictionarySyncedAt` 字段

TranslationTask 新增字段，快照页面 UI 已使用，但数据模型文档未更新。

### 4. `seenHashes` 去重机制

Save API 中的任务内去重逻辑未记录。

### 5. 品牌资源

`public/babeltower-icon.svg` 和 `public/babeltower-brand.svg` 未在文档中提及。

### 6. `AGENTS.md` 和 `CLAUDE.md`

新增的项目级工作流文档未在索引中引用。

### 7. 测试文件

新增 `tests/domain/exporter/export-files.test.ts` 和 `tests/lib/standard.test.ts` 未在测试文档中记录。

## 教训

1. **Save API 的"简化"是重大语义变更**：从"保存并锁定任务"变为"仅同步字典"。这种变更改变了整个工作流语义。
2. **导出系统的双文件模式改变了客户端行为**：客户端现在需要处理两个文件下载，而非一个。
3. **properties 模板导出是高级功能**：需要明确记录解析器和导出器之间的协作机制。
4. **删除 ui-design/ 目录是重大变更**：所有设计参考和原型被移除。

## 提升候选

1. **导出系统架构文档**：`architecture/domain-engine.md` 应新增一节专门描述双文件导出和文件名推断逻辑。
2. **Save API 语义变更指南**：`must/data-flow.md` 需要大幅更新 save 行为描述。
3. **properties 模板导出指南**：`guides/` 中应新增一节描述模板导出的工作原理。
