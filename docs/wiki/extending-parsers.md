# 如何扩展解析器

BabelTower 的解析器架构遵循"插件化"设计。每种文件格式实现两个接口：解析器（Input → Standard JSON）和导出器（Standard JSON → Output）。

## 架构概览

```
┌──────────┐    parse()     ┌──────────────┐    export()    ┌──────────┐
│  Input   │ ─────────────→ │   Standard    │ ─────────────→ │  Output  │
│  File    │                │    JSON       │                │  File    │
└──────────┘                └──────────────┘                └──────────┘
     │                           │                              │
     ├─ JSON                     │                              ├─ JSON
     ├─ Properties               │                              ├─ Properties
     ├─ YAML (待扩展)            │                              └─ YAML (待扩展)
     ├─ iOS .strings (待扩展)    │
     └─ Android XML (待扩展)     │
```

## 解析器接口

每种格式需要实现以下接口：

```typescript
// src/lib/parser/types.ts — 建议创建此文件统一接口

import type { StandardI18nDocument } from './standard-i18n'

export interface Parser {
  /** 解析器名称 */
  name: string
  /** 支持的文件扩展名列表 */
  extensions: string[]
  /** 解析输入文本为 Standard JSON */
  parse(input: string): StandardI18nDocument
}

export interface Exporter {
  /** 导出器名称（通常与 Parser 配对） */
  name: string
  /** 支持的文件扩展名 */
  extension: string
  /** 将 Standard JSON 导出为目标格式 */
  export(doc: StandardI18nDocument, lang: string): string
}
```

## 示例：新增 YAML 解析器

### Step 1 — 创建解析器文件

`src/lib/parser/yaml.ts`:

```typescript
import type { StandardI18nDocument, StandardI18nEntry } from './standard-i18n'
import yaml from 'js-yaml'

export function parseYaml(input: string): StandardI18nDocument {
  const raw = yaml.load(input) as Record<string, unknown>
  const entries: StandardI18nEntry[] = []
  const keyOrder: string[] = []

  function walk(obj: unknown, prefix: string): void {
    if (typeof obj === 'string') {
      entries.push({ key: prefix, zh: obj, en: '' })
      keyOrder.push(prefix)
    } else if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        walk(v, prefix ? `${prefix}.${k}` : k)
      }
    }
  }

  walk(raw, '')
  return { format: 'json', entries, keyOrder } // YAML 结构同 JSON，复用 format
}

export function exportToYaml(doc: StandardI18nDocument, lang: string): string {
  const result: Record<string, unknown> = {}
  for (const entry of doc.entries) {
    const value = lang === 'zh' ? entry.zh : entry.en
    setNestedValue(result, entry.key, value)
  }
  return yaml.dump(result, { indent: 2 })
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {}
    current = current[keys[i]] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}
```

### Step 2 — 注册到解析器注册表

`src/lib/parser/registry.ts`:

```typescript
import { parseJson, exportToJson } from './json'
import { parseProperties, exportToProperties } from './properties'
import { parseYaml, exportToYaml } from './yaml'
import type { Parser, Exporter } from './types'

const parserRegistry: Record<string, Parser> = {
  json: { name: 'json', extensions: ['.json'], parse: parseJson },
  properties: { name: 'properties', extensions: ['.properties'], parse: parseProperties },
  yaml: { name: 'yaml', extensions: ['.yaml', '.yml'], parse: parseYaml },
}

const exporterRegistry: Record<string, Exporter> = {
  json: { name: 'json', extension: '.json', export: exportToJson },
  properties: { name: 'properties', extension: '.properties', export: exportToProperties },
  yaml: { name: 'yaml', extension: '.yaml', export: exportToYaml },
}

export function getParser(ext: string): Parser | undefined {
  return Object.values(parserRegistry).find(p => p.extensions.includes(ext))
}

export function getExporter(format: string): Exporter | undefined {
  return exporterRegistry[format]
}

export function listSupportedFormats(): string[] {
  return Object.keys(parserRegistry)
}
```

### Step 3 — 更新 API 和前端

在翻译任务 API 中：

```typescript
// src/app/api/tasks/route.ts POST handler
import { getParser } from '@/lib/parser/registry'

const parser = getParser(format) // format 从 '.json' / '.yaml' 扩展名推断
if (!parser) {
  return NextResponse.json({ error: `Unsupported format: ${format}` }, { status: 400 })
}
const doc = parser.parse(fileContent)
```

在前端上传组件中：

```tsx
<select>
  <option value=".json">JSON (.json)</option>
  <option value=".properties">Properties (.properties)</option>
  <option value=".yaml">YAML (.yaml, .yml)</option>
  <option value=".strings">iOS Strings (.strings)</option>
  <option value=".xml">Android XML (.xml)</option>
</select>
```

## 新增解析器检查清单

- [ ] 实现 `Parser.parse()` — 输入文件内容 → StandardI18nDocument
- [ ] 实现 `Exporter.export()` — StandardI18nDocument → 输出文件内容
- [ ] 正确处理 Unicode 字符（非 ASCII 的处理策略）
- [ ] 保留注释（如果格式支持注释）
- [ ] 保留 key 顺序
- [ ] 单元测试覆盖：正常解析、空文件、特殊字符、多行值、大文件
- [ ] 注册到 `registry.ts`
- [ ] 更新前端格式选择器
- [ ] 更新 OpenAPI 契约（`FileFormat` enum）
- [ ] 更新 Prisma Schema（`FileFormat` enum）

## 常见格式扩展参考

| 格式 | 难度 | 注意事项 |
|------|------|---------|
| YAML | 低 | 结构与 JSON 相同，使用 js-yaml 库即可 |
| iOS `.strings` | 中 | 格式为 `"key" = "value";`，需处理 `%@` 等占位符 |
| Android `strings.xml` | 中 | XML 解析，需处理 `<![CDATA[...]]>`、`%s` 占位符 |
| gettext `.po` | 高 | 复杂格式，有 `msgid`/`msgstr`、plural forms |
| CSV | 低 | 简单行列结构，但需约定 key/zh/en 列映射 |
