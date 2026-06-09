---
name: export-target-template-comments
description: 修复双文件导入后导出译文文件丢失目标文件注释的问题。根因是导出 API 只把 rowsToDocument(rows, docs.source) 传给 buildDualExportFiles，译文文件复用源文件模板，完全忽略 docs.target 中的目标文件模板和注释；修复为 buildDualExportFiles 接收 targetDocument，译文文件优先用目标模板替换值，properties 缺失 key 时追加补出。
metadata:
  type: reflection
  date: 2026-06-09
---

# 导出目标文件注释反思：双文件导入不能只用源模板

用户要求“导出时不要丢失导入文件内写的注释信息”。关键风险点不是 `.properties` 或 TS 单文件模板导出本身，而是双文件导入场景：目标文件也可能有自己的注释和排版。

## Task

- 期望：导出文件保留导入文件内已有注释。
- 实际风险：双文件导入后，译文文件导出只复用源文件 `docs.source` 模板；目标文件 `docs.target` 的注释、header、局部说明会丢失。

## Root Cause

- `POST /api/tasks/{id}/export` 使用 `rowsToDocument(rows, docs.source)` 构造当前文档，然后调用 `buildDualExportFiles(document, targetFilename)`。
- `buildDualExportFiles()` 生成译文文件时只是把同一个 document 改成英文文件名并启用 `dictionaryPriority`。
- 因此双文件导入虽然持久化了 `standardDocuments.target`，导出阶段没有把它作为译文文件模板使用。

## Fix

- `buildDualExportFiles()` 增加 `targetDocument` 选项。
- 译文文件导出时，如果 `targetDocument.sourceFormat` 与当前文档一致，优先使用目标文档模板/metadata，再按 key 写入当前行的最新译文。
- `.properties` 模板导出遇到模板中不存在的 key 时，不再整体回退为纯生成模式；改为先保留模板并替换已有 key，再把缺失 key 追加到文件末尾。
- 导出 API 的 DB 与 local-store 路径都传入 `docs.target`，保持一致。

## Promotion Candidates

- 在导出链路文档中明确：单文件导出译文沿用源模板；双文件导出译文应优先使用目标文件模板。
- 后续扩展格式时，模板 metadata 不只是 source 侧信息；source/target 两侧都可能是导出事实源的一部分。
