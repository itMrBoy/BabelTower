---
name: domain-engine
description: Standard JSON 中间结构、解析器、冲突检测、导出器与保存服务的完整架构
metadata:
  type: architecture
---

# 领域引擎架构

## 1. Standard JSON 中间结构

所有格式（JSON / .properties）解析后统一转换为 `StandardI18nDocument`，这是整个系统的核心中间表示。

### 核心类型

`src/domain/standard-i18n/types.ts`

```typescript
interface StandardI18nEntry {
  key: string;                    // dot-notation, e.g. "a.b.c"
  keyPath: string[];              // ["a", "b", "c"]
  sourceValue: string | null;     // 中文原文
  translatedValue: string | null; // 英文译文
  locale: string;                 // e.g. "en-US"
  status: EntryStatus;            // NORMAL | UNSUPPORTED_VALUE | DUPLICATED_KEY
  sourceLocation?: SourceLocation; // 原始文件行/列位置
  metadata?: Record<string, string>; // .properties 注释等
}

interface StandardI18nDocument {
  entries: StandardI18nEntry[];
  locale: string;
  sourceFormat: 'json' | 'properties';
  sourceName: string;
  metadata?: Record<string, unknown>;
}
```

**关键设计决策：**
- `sourceValue` 始终存放中文，`translatedValue` 存放英文。这是 "Chinese-first" 架构的基础。
- `key` 和 `keyPath` 同时存在：`key` 用于快速查找，`keyPath` 用于重建嵌套结构。
- `status` 标记解析异常：`UNSUPPORTED_VALUE` 表示非字符串叶子值（number, boolean, null, array item）；`DUPLICATED_KEY` 表示 .properties 中重复 key。

### flatten / unflatten 工具

`src/domain/standard-i18n/utils.ts`

- `flatten(obj)`：将嵌套对象递归展平为 `Map<string, string | null>`。数组不被展开，整个数组作为非字符串值处理，存为 `null`。
- `unflatten(map)`：将扁平 Map 恢复为嵌套对象。`null` 值被跳过，不会出现在输出中。

## 2. 解析器架构

### 2.1 JSON 解析器

`src/domain/parser/json-parser.ts` (`parseJson`)

**PositionScanner**（行 17-49）：预处理阶段扫描所有 `\n` 位置构建 `lineStarts` 数组（O(n)）。定位时用 `indexOf` 查找字符串位置，二分查找确定行号（O(log lines)）。

**walkObject**（行 54-163）：递归遍历 JSON 对象：
- **数组处理**：数组元素用数字索引作为 key segment（如 `items.0`）。字符串数组项标记为 `UNSUPPORTED_VALUE` 但保留 `sourceValue`；非字符串数组项 `sourceValue = null`。嵌套对象在数组中仍会递归处理。
- **普通对象**：嵌套对象递归；字符串值创建 `NORMAL` 条目并尝试源码定位；非字符串值标记 `UNSUPPORTED_VALUE`。
- **源码定位策略**：先搜索 `"${key}"` 定位 key，从 key 后找第一个 `"` 定位 value 开始，调用 `scanner.locate(value, afterColon)` 获取精确位置。`searchFrom` 持续前进防止回退匹配同名 key。

### 2.2 Properties 解析器

`src/domain/parser/properties-parser.ts` (`parseProperties`)

处理流程：
1. 按行分割：`input.split(/\r?\n/)` 处理 Windows/Unix 换行
2. 注释行：以 `#` 或 `!` 开头的行累积到 `currentComment`，多行注释用 `\n` 连接，附加到下一个 key-value 条目的 `metadata.comment`
3. 续行处理：行尾单个 `\`（非转义的 `\\`）表示续行，去掉 `\` 拼接下一行
4. 分隔符查找：`findDelimiter` 查找第一个未转义的 `=` 或 `:`
5. Unicode 转义还原：`unescapeUnicode` 将 `\uXXXX` 转为对应字符
6. 重复 key 检测：用 `seenKeys: Map<string, number>` 记录。发现重复时新条目标记 `DUPLICATED_KEY`，同时更新已有条目的值（.properties 语义：last wins）。`seenKeys` 不更新 index，后续重复仍指向第一个条目。

### 2.3 TS 解析器

`src/domain/parser/ts-parser.ts` (`parseTs`)

TS 解析器是一种轻量包装：
1. `extractDefaultObject`：用正则匹配 `export default { ... }` 格式，提取花括号内容
2. `parseObjectLiteral`：将提取的对象字面量用 `Function("return (" + literal + ")")()` 安全求值（strict mode），支持未引号 key 和单引号
3. 内部调用 `parseJson` 将求值后的对象转为 `StandardI18nDocument`
4. 最终 `sourceFormat` 设为 `'ts'`

**约束**：仅支持静态 `export default { ... }` 对象，不支持变量引用、函数调用等动态表达式。

## 3. 冲突检测引擎

`src/domain/conflict/conflict-detector.ts` (`detectConflicts`)

### 3.1 文本归一化

```typescript
function normalizeText(text: string): string {
  return text
    .normalize('NFKC')     // Unicode NFKC 规范化
    .trim()                 // 去除首尾空白
    .replace(/\s+/g, ' ');  // 连续空白压缩为单个空格
}
```

NFKC 规范化统一全角/半角、兼容字符（如将全角数字转为半角）。

### 3.2 三级冲突检测

算法分两个阶段：

**阶段 1：精确匹配（O(n+m)）**
- `prepareEntries()` 预处理：NFKC 归一化、过滤空值
- `exactExistingByChinese: Map<string, PreparedEntry[]>` 按归一化中文分组字典条目
- 对新条目，直接在 Map 中查找精确匹配，无需遍历全部字典

**类型 1：DUPLICATE_IDENTICAL（info 级别）**
- 中文完全相同 + 英文也相同 → info（无需操作）
- 中文完全相同 + 英文不同 → **blocking**（`EXACT_CHINESE_DIFF_ENGLISH`）

**阶段 2：相似匹配（O(n*m) 但大幅缩减）**
- 仅对**未在阶段 1 中精确匹配**的条目执行 Jaro-Winkler 相似度计算
- 避免了对已精确匹配的重复项做无意义的相似度比较

**类型 2：SIMILAR_CHINESE（warning 级别）**
- 中文不完全相同，但 Jaro-Winkler 相似度 >= 0.9（默认阈值）→ warning
- 相似度值记录在 `ConflictItem.similarity` 中

**类型 3：无冲突**
- 中文不同且相似度低于阈值 → 不产生冲突条目

### 3.3 Jaro-Winkler 相似度算法

`src/domain/conflict/jaro-winkler.ts` (`jaroWinkler`)

**Jaro 相似度公式：**
```
Jaro = (m/|s1| + m/|s2| + (m - t/2)/m) / 3
```
- `m` = 匹配字符数（在匹配窗口内找到相同字符）
- `t` = 换位次数（匹配字符中顺序不同的对数）
- 匹配窗口：`floor(max(|s1|, |s2|) / 2) - 1`

**Winkler 修正：**
```
JaroWinkler = Jaro + prefixLen * 0.1 * (1 - Jaro)
```
- `prefixLen` = 共同前缀长度（最多 4）
- 前缀每多一个字符，相似度提升 `0.1 * (1 - Jaro)`
- 返回值范围 `[0, 1]`，1 表示完全相同

**注意**：Jaro-Winkler 对短字符串敏感，"你好" vs "您好" 可能超过 0.9。

### 3.4 Chinese-first 匹配设计

冲突检测基于 `sourceValue`（中文文本），而非 `key`。

- 优点：重命名 key 不会丢失字典匹配，字典可以跨 key 复用翻译
- 缺点：相同中文但不同 key 的条目会互相冲突

## 4. 导出器架构

### 4.1 JSON 导出器

`src/domain/exporter/json-exporter.ts` (`exportToJson`)

- `buildNestedObject`：按 `keyPath` 逐段构建嵌套对象，保持原始 entry 顺序
- 跳过 `UNSUPPORTED_VALUE` 且 `sourceValue === null` 的条目
- `dictionaryPriority: true` 时优先使用 `translatedValue`（字典值），否则使用 `sourceValue`
- 默认缩进 2 个空格，末尾追加换行符

### 4.2 Properties 导出器

`src/domain/exporter/properties-exporter.ts` (`exportToProperties`)

- `escapeValue`：转义规则 — `\` → `\\`, `\n` → `\n`, `\r` → `\r`, `\t` → `\t`, 控制字符 → `\uXXXX`
- 跳过 `UNSUPPORTED_VALUE` 且 `sourceValue === null` 的条目
- `dictionaryPriority` 为 true 时优先使用 `translatedValue`
- 如果条目有 `metadata.comment`，先输出 `# comment` 行
- 输出 `key=value` 格式（始终用 `=` 分隔符）

## 5. 保存服务

`src/domain/persistence/save-service.ts`

### 5.1 文档验证 (`validateDocument`)

验证规则：
1. 至少有一个 entry
2. 每个 entry 的 key 非空
3. 每个 entry 至少有一个非 null 值（sourceValue 或 translatedValue）
4. 相同 key 的 keyPath 长度必须一致

### 5.2 Diff 生成 (`generateDiff`)

1. 调用 `detectConflicts` 获取冲突摘要
2. 将所有冲突（blocking + warning + info）合并
3. 每个冲突创建一个 `DiffPatch`，包含冲突项和预解析策略

### 5.3 保存文档 (`saveDocument`)

1. 验证文档，失败返回 `FAILED` 状态的 snapshot
2. 创建 `SAVED` 状态的 snapshot
3. 如果提供了 `existingDictionary`，生成 diff
4. 如果没有 blocking 冲突，标记 `dictionaryUpdated = true`

**注意**：`saveDocument` 不执行真正的持久化操作，仅构建 `SaveResult` 数据结构。真正的保存逻辑在 API 路由和 `local-store.ts` 中。

### 5.4 导出文档 (`exportDocument`)

- 根据 `sourceFormat` 选择 JSON 或 properties 导出器
- 始终先导出源文件版本（`dictionaryPriority: false`）
- 如果提供了 dictionary，额外导出字典优先版本
- 字典版本文件名格式：`{baseName}.dictionary.{locale}.{ext}`

### 5.5 应用解析策略 (`applyResolutions`)

| 策略 | 行为 |
|------|------|
| `KEEP_EXISTING` | `translatedValue = existing.translatedValue`（保留字典值） |
| `UPDATE_DICTIONARY` | `translatedValue = entry.translatedValue ?? entry.sourceValue`（用新值更新） |
| `IGNORE_SIMILAR` | `translatedValue = existing.translatedValue`（与 KEEP_EXISTING 相同） |

## 6. 领域适配层

`src/lib/standard.ts`

| 函数 | 用途 |
|------|------|
| `normalizeText` | NFKC + trim + 空白压缩（与冲突检测器一致） |
| `chineseHash` | 对归一化后的中文计算 SHA-256 |
| `detectSourceFormat` | 根据文件名和显式格式推断 SourceFormat（支持 json/properties/ts） |
| `parseI18nDocument` | 统一入口，按格式分发到对应解析器 |
| `mergeTargetDocument` | DUAL_SOURCE 模式下将 target 文件值合并到 source 条目 |
| `buildPreviewRows` | 将 StandardI18nDocument 转为 PreviewRow[] |
| `annotateConflictLevels` | 将冲突摘要级别合并到预览行 `conflictLevel`，优先级 blocking > warning > info |
| `dictionaryToStandardEntry` | 将数据库字典条目转为 StandardI18nEntry |
| `rowsToDocument` | 将 UI 预览行转换回 StandardI18nDocument |
| `previewRowToDraftData` | PreviewRow → TaskDraftRow 创建数据 |
| `draftRowToPreviewRow` | TaskDraftRow → PreviewRow |
| `draftRowsToPreviewRows` | TaskDraftRow[] → PreviewRow[]（按 rowIndex 排序） |

## 7. 性能特征

| 组件 | 复杂度 | 瓶颈场景 |
|------|--------|----------|
| JSON 解析 | O(n) | 大文件字符串扫描 |
| Properties 解析 | O(lines) | 多行续行处理 |
| TS 解析 | O(n) | 正则提取 + JSON 解析 |
| 冲突检测（精确） | O(n+m) | 字典分组 Map 构建 |
| 冲突检测（相似） | O(n*m) | 仅对未精确匹配的条目执行，字典 5000 条 + 新文件 1000 条 = 最多 500 万次比较 |
| Jaro-Winkler | O(L^2) | 长字符串相似度计算 |
| JSON 导出 | O(entries) | 嵌套对象构建 |
| Properties 导出 | O(entries) | 转义处理 |

当前限制：Prisma 查询 `take: 5000`，这是冲突检测的性能上限。精确匹配优化使实际比较次数通常远低于理论最大值。
