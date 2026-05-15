Create a professional SaaS web application page for an i18n dictionary management tool called "BabelTower".

This is the **Conflict Handling** page where users review and resolve translation conflicts.

## Layout
- Left sidebar (dark #1E293B, 240px) with navigation: Upload & Parse, Conflict Handling (active with red badge showing "12"), Dictionary Search, Task Snapshots, Export Config
- Top bar with page title "Conflict Handling" and language pair selector "zh-CN → en-US"
- Main white content area

## Content

### Row 1: Conflict Summary Cards (4 stat cards in a row)
1. "Exact ZH Diff Target" — count: 3 — red #DC2626 — icon: AlertTriangle
2. "High Similarity" — count: 5 — amber #F59E0B — icon: GitCompare
3. "Duplicate Key" — count: 2 — indigo #6366F1 — icon: Copy
4. "Format/Parse Error" — count: 2 — red #DC2626 — icon: FileX

### Row 2: Conflict Table (main area)
A data table with columns: Key, Source (zh-CN), Target (en-US), Conflict Type, Actions

Show these sample rows:
1. Key: "app.submit" | zh: 提交 | en: Submit | Type: exact_zh_diff_target (red left border, light red bg) | Buttons: [Keep Target] [Edit] [Ignore]
2. Key: "user.greeting" | zh: 你好 | en: Hello there | Type: high_similarity (amber left border, light yellow bg) | Buttons: [Confirm] [Edit] | Show "87% similarity" badge
3. Key: "common.cancel" | zh: 取消 | en: Cancel | Type: duplicate_key (indigo left border, light purple bg) | Buttons: [Keep First] [Keep Second] [Merge]
4. Key: "error.timeout" | zh: [PARSE ERROR] | en: — | Type: format_parse_error (red dashed border, light red bg) | Buttons: [View Raw] [Skip]
5. Key: "nav.home" | zh: 首页 | en: Home | Type: high_similarity (amber left border) | Buttons: [Confirm] [Edit] | "92% similarity"

### Row 3: Action Bar (bottom)
- Primary button: "Resolve All Checked" (blue #2563EB)
- Secondary button: "Batch Accept Suggestions"
- Text: "5 conflicts remaining"

## Design System
- Primary: #2563EB, Success: #16A34A, Warning: #F59E0B, Danger: #DC2626, Info: #6366F1
- Font: Inter for UI, JetBrains Mono for keys
- Clean, high-density developer tool aesthetic