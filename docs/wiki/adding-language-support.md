# 如何新增语种支持

BabelTower 当前以中英双语为主。本文档说明如何扩展支持更多语种（如日文 `ja`、韩文 `ko`、法文 `fr` 等）。

## 前置理解

BabelTower 的语言模型建立在以下假设之上：

- **基准语言固定为中文**：所有字典条目以中文为唯一标识
- **字典条目是一对多关系**：一条中文 → 多种目标语言翻译
- **冲突检测以基准语言为准**：同中文+不同目标语言翻译视为冲突

## 扩展步骤

### 1. 修改 Prisma Schema

当前 Dictionary 模型：

```prisma
model Dictionary {
  zh String @unique
  en String
}
```

扩展为多语言支持：

```prisma
model Dictionary {
  id        String   @id @default(uuid())
  zh        String   @unique
  en        String
  ja        String?  // 新增：日文
  ko        String?  // 新增：韩文
  fr        String?  // 新增：法文
  projectId String
  project   Project  @relation(fields: [projectId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

或使用更灵活的 JSON 列存储（适合语种不确定的场景）：

```prisma
model Dictionary {
  id           String   @id @default(uuid())
  zh           String   @unique
  translations Json     // { "en": "...", "ja": "...", "ko": "..." }
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

> JSON 方案更灵活但失去列级别的类型约束，建议在语种稳定的情况下使用列方案。

### 2. 更新 Standard JSON 类型

`src/lib/parser/standard-i18n.ts`:

```typescript
export interface StandardI18nEntry {
  key: string
  zh: string
  // 从单一 en 扩展为多语言 map
  translations: Record<string, string>  // { "en": "...", "ja": "...", ... }
  line?: number
  meta?: Record<string, unknown>
}
```

### 3. 更新 API 接口

字典搜索接口新增 `lang` 参数：

```
GET /api/dictionaries?q=首页&lang=ja
```

翻译回填时指定目标语言：

```
POST /api/tasks/translate
{
  "taskId": "...",
  "targetLang": "ja"
}
```

### 4. 更新导出逻辑

`src/lib/export.ts` 中的 `exportDocument` 函数：

```typescript
export function exportDocument(
  doc: StandardI18nDocument,
  lang: string,  // 从 'zh' | 'en' 改为 string
  dictionary: Map<string, string>,
): string {
  // 从 translations map 中取对应语言的值
}
```

### 5. 更新前端 UI

- 翻译工作台表格增加语言选择器（Dropdown）
- 字典管理页面增加语言列筛选
- 导出对话框增加目标语言选项

### 6. 数据库迁移

```bash
# 创建迁移
npx prisma migrate dev --name add_multi_language_support

# 回填现有数据（如果从 en 列迁移到 JSON）
# 编写数据迁移脚本
```

## 影响范围总结

| 模块 | 变更内容 |
|------|---------|
| `prisma/schema.prisma` | Dictionary 模型增加语言列或 JSON translations 字段 |
| `src/lib/parser/standard-i18n.ts` | StandardI18nEntry 类型扩展 |
| `src/lib/parser/json.ts` | 无需变更（语种无关） |
| `src/lib/parser/properties.ts` | 无需变更（语种无关） |
| `src/lib/conflict.ts` | 冲突检测逻辑适配多语言 |
| `src/lib/export.ts` | 导出函数增加 lang 参数 |
| `src/app/api/dictionaries/` | 增加 lang 查询参数 |
| `src/app/api/tasks/` | 翻译回填指定语言 |
| 前端组件 | 语言选择器、多列展示 |

## 注意事项

1. **基准语言不可变**：中文始终是唯一标识，不支持切换基准语言
2. **冲突检测粒度**：同一中文 + 同一目标语言的不同翻译才视为 `exact_zh_diff_target`
3. **UI 复杂度控制**：语种超过 5 个时建议使用 Tab 切换而非横向扩展列
