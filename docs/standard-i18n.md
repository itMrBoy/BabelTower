# Standard JSON 中间结构

## 1. 目标

Standard JSON 是 BabelTower 的内部标准表达，用于打通 JSON 与 properties：

```text
Input (File) -> Parser -> Standard JSON -> Conflict Check -> Database
```

它必须满足：

- JSON / properties 都能解析成同一种结构。
- 预览表直接由 entries 生成。
- 冲突检测只依赖 entries 中的中文、英文候选值。
- 导出时可以恢复为 JSON 或 properties。

## 2. TypeScript 结构

```ts
export type FileFormat = "json" | "properties";
export type LocaleRole = "source" | "target" | "dictionary";

export interface StandardI18nDocument {
  schemaVersion: "1.0";
  format: FileFormat;
  locale?: string;
  role: LocaleRole;
  keySeparator: ".";
  entries: StandardI18nEntry[];
  meta: StandardI18nMeta;
}

export interface StandardI18nEntry {
  key: string;
  keyPath: string[];
  value: string;
  valueType: "string";
  order: number;
  source: {
    line?: number;
    column?: number;
    rawKey?: string;
    rawValue?: string;
  };
  flags?: StandardI18nEntryFlag[];
}

export type StandardI18nEntryFlag =
  | "UNSUPPORTED_VALUE"
  | "DUPLICATED_KEY"
  | "MISSING_IN_SOURCE"
  | "MISSING_IN_TARGET";

export interface StandardI18nMeta {
  originalFilename: string;
  encoding: "utf-8";
  detectedFormat: FileFormat;
  parserVersion: string;
  totalEntries: number;
  ignoredEntries: number;
  formatOptions: JsonFormatOptions | PropertiesFormatOptions;
}

export interface JsonFormatOptions {
  type: "json";
  indent: number;
  preserveKeyOrder: true;
}

export interface PropertiesFormatOptions {
  type: "properties";
  separator: "=" | ":";
  preserveKeyOrder: true;
  escapeUnicode: boolean;
}
```

## 3. 预览行结构

任务页不直接编辑 StandardI18nEntry，而是编辑由它派生的 PreviewRow：

```ts
export interface PreviewRow {
  rowId: string;
  key: string;
  keyPath: string[];
  zhText: string;
  enText?: string;
  dictionaryText?: string;
  finalEnText?: string;
  status: "READY" | "MISSING_REQUIRED" | "CONFLICT" | "UNSUPPORTED";
  conflicts: ConflictSummaryItem[];
  updatedAt: string;
}
```

- 单中文文件模式：`zhText` 来自中文文件，`enText` 由字典回填或用户编辑。
- 双文件模式：`zhText` 来自中文文件，`enText` 来自英文文件，`dictionaryText` 来自字典命中。
- 导出英文时：单文件模式取 `enText`；双文件模式取 `dictionaryText || enText`。

## 4. JSON 解析规则

输入：

```json
{
  "common": {
    "save": "保存",
    "cancel": "取消"
  }
}
```

输出 entries：

```json
[
  { "key": "common.save", "keyPath": ["common", "save"], "value": "保存", "order": 0 },
  { "key": "common.cancel", "keyPath": ["common", "cancel"], "value": "取消", "order": 1 }
]
```

规则：

- 只抽取字符串 leaf value。
- 对象层级使用 `.` 拼接为 key。
- key 中原本包含 `.` 时，Parser 必须保留 `keyPath`，导出 JSON 时以 `keyPath` 为准。
- 非字符串 leaf value 不参与翻译，生成 `UNSUPPORTED_VALUE` 标记。
- 数组在 MVP 中不作为可翻译结构，遇到数组标记为 `UNSUPPORTED_VALUE`。

## 5. Properties 解析规则

输入：

```properties
common.save=保存
common.cancel=取消
```

输出 entries：

```json
[
  { "key": "common.save", "keyPath": ["common", "save"], "value": "保存", "order": 0 },
  { "key": "common.cancel", "keyPath": ["common", "cancel"], "value": "取消", "order": 1 }
]
```

规则：

- 支持 `key=value` 和 `key:value`。
- 空行、注释行不进入 entries。
- 基础转义在解析阶段还原，在导出阶段重新转义。
- 同 key 重复出现时，保留最后值，并给重复项添加 `DUPLICATED_KEY` 标记。

## 6. 互转规则

### 6.1 Standard JSON -> JSON

- 按 `order` 排序。
- 根据 `keyPath` 构建嵌套对象。
- value 使用对应语言列的最终值。
- 使用 `meta.formatOptions.indent` 控制缩进。

### 6.2 Standard JSON -> Properties

- 按 `order` 排序。
- 每行输出 `key=value`。
- value 根据 properties 规则转义换行、反斜杠和分隔符。
- 默认使用 UTF-8，不强制 Unicode escape。

### 6.3 JSON -> Properties

```text
JSON Parser -> Standard JSON -> Properties Exporter
```

### 6.4 Properties -> JSON

```text
Properties Parser -> Standard JSON -> JSON Exporter
```

## 7. Key 一致性校验

双文件模式必须校验中文文件与英文文件的 key 集合：

- 中文存在、英文缺失：生成 `MISSING_IN_TARGET`。
- 英文存在、中文缺失：生成 `MISSING_IN_SOURCE`。
- key 集合不一致时允许进入预览，但保存前必须修复。
