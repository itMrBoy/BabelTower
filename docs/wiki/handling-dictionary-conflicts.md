# 如何处理字典冲突

字典冲突是 BabelTower 去重管理的核心机制。本文档面向产品经理和开发者，说明冲突的类型、原因和操作流程。

## 冲突类型速查

| 类型 | 图标 | 严重度 | 说明 |
|------|------|--------|------|
| `exact_zh_diff_target` | ⚠️ | 高 | 同一句中文，字典中已有不同的英文翻译 |
| `high_similarity` | 🔔 | 中 | 新增中文与字典中某条高度相似（≥85%），可能重复 |
| `duplicate_key` | 🚫 | 高 | 同一文件中存在重复的 key |
| `format_parse_error` | ❌ | 阻断 | 文件格式无法解析 |

## 冲突场景与操作指南

### 场景一：同中文不同英文（exact_zh_diff_target）

**触发条件**：保存翻译时，中文 "确认删除" 在字典中已有翻译 "Confirm Delete"，但当前文件中的翻译为 "Delete Confirmation"。

**弹窗内容**：

```
冲突类型：翻译不一致
中文：确认删除
字典已有翻译：Confirm Delete
当前提交翻译：Delete Confirmation

请选择：
[保留已有]  [使用新值]  [跳过此条]
```

**操作建议**：

1. **保留已有**（推荐）：字典中经审核的翻译优先，保证多端统一
2. **使用新值**：当你确认新翻译更准确时使用，会更新字典
3. **跳过**：暂不处理，该条目不写入字典

**底层逻辑**（`src/lib/conflict.ts`）：

```typescript
// 相同中文，字典中已有不同英文
const existingEn = existingDict.get(entry.zh)
if (existingEn !== undefined && entry.en && existingEn !== entry.en) {
  conflicts.push({
    type: 'exact_zh_diff_target',
    key: entry.key,
    zh: entry.zh,
    existingEn,
    newEn: entry.en,
  })
}
```

### 场景二：高相似度警告（high_similarity）

**触发条件**：录入 "确认删除此项目" 时，字典中已存在 "确认删除"，相似度超过 85%。

**弹窗内容**：

```
冲突类型：疑似重复
新条目："确认删除此项目"
字典已有："确认删除"（相似度 88.9%）
位置：项目A > 通用文案

建议：如果是同一句文案的变体，请合并为一个条目。
[合并到已有]  [作为新条目]  [跳过]
```

**操作建议**：

1. **合并到已有**：当确认两句话含义相同时使用（如仅标点差异）
2. **作为新条目**：当两句话确实含义不同时使用
3. **跳过**：人工判断后再处理

**相似度算法**（基于 2-gram Jaccard）：

```typescript
function calculateSimilarity(a: string, b: string): number {
  const bigramsA = getBigrams(a)
  const bigramsB = getBigrams(b)
  const intersection = new Set([...bigramsA].filter(x => bigramsB.has(x)))
  const union = new Set([...bigramsA, ...bigramsB])
  return union.size === 0 ? 0 : intersection.size / union.size
}
```

当前阈值设为 85%。如需调整，修改 `src/lib/conflict.ts` 中的 `0.85` 即可。

### 场景三：Key 重复（duplicate_key）

**触发条件**：同一个 JSON/properties 文件中出现相同的 key。

**弹窗内容**：

```
冲突类型：Key 重复
Key："nav.title"
第 3 行：中文 "首页"
第 12 行：中文 "主页"

此问题必须修复后才能保存。
[返回编辑]
```

**处理方式**：必须返回编辑页面修改 key 名称，或删除重复条目。系统**阻止保存**直至修复。

### 场景四：格式解析错误（format_parse_error）

**触发条件**：
- JSON：语法错误、未闭合引号
- Properties：不包含 `=` 号的行、非法 Unicode 转义

**弹窗内容**：

```
冲突类型：格式解析错误
文件：common.properties
第 15 行：未识别的格式
    15 | nav.title 首页
        ↑ 缺少 '=' 号

[返回重新上传]
```

## 批量冲突处理

当一次保存操作产生多个冲突时：

1. 弹窗顶部显示冲突汇总：「共检测到 5 个冲突：3 个翻译不一致、1 个疑似重复、1 个格式错误」
2. 冲突按类型分组展示，每组可折叠
3. 同类型冲突支持「全部应用同一操作」（如全部保留已有）
4. 逐条确认完成后，点击「应用并保存」
5. 只有用户确认过的条目才会写入字典

## 冲突记录持久化

所有冲突（包括已解决和未解决的）都存储在 `Conflict` 表中：

```prisma
model Conflict {
  id         String       @id
  taskId     String
  key        String       // 冲突 key
  type       ConflictType // exact_zh_diff_target | high_similarity | ...
  detail     Json         // { zh, existingEn, newEn, similarity, ... }
  resolved   Boolean      @default(false)
  resolvedAt DateTime?
}
```

这允许：
- 审计追踪：谁在何时解决了什么冲突
- 回滚分析：如果批量确认后发现错误，可以追溯原始冲突详情
- 统计优化：高频冲突的中文条目说明需要规范术语表
