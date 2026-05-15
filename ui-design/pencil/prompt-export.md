Create a professional SaaS web application page for an i18n dictionary management tool called "BabelTower".

This is the **Export Configuration** page where users configure and confirm export of translation dictionaries.

## Layout
- Left sidebar (dark #1E293B, 240px) with navigation: Upload & Parse, Conflict Handling, Dictionary Search, Task Snapshots, Export Config (active)
- Top bar with page title "Export Configuration" and language pair selector "zh-CN → en-US"
- Main white content area

## Content - Three-column or stacked layout

### Section 1: Export Format Selector (top)
- 4 format option cards in a horizontal row:
  1. JSON — selected (blue border #2563EB, light blue bg) — icon: braces — "Nested or flat JSON"
  2. YAML — icon: brackets — "Human-readable YAML"
  3. CSV — icon: table — "Spreadsheet compatible"
  4. PO (Gettext) — icon: file-text — "GNU gettext format"

### Section 2: Scope Configuration (middle, two columns)
**Left column — Language Selection:**
- Checkbox list: Source language always included
- zh-CN ✓ (source, required)
- en-US ✓ (checked)
- ja-JP ☐ (unchecked)
- ko-KR ☐ (unchecked)
- fr-FR ✓ (checked)

**Right column — Module/Key Filter:**
- Radio: "All modules" (selected)
- Radio: "Selected modules only"
  - common ✓ / auth ✓ / dashboard ✓ / settings ☐ / errors ✓
- Search filter input: "Filter keys..."
- Toggle: "Include untranslated entries" — ON
- Toggle: "Include review-status entries" — ON

### Section 3: Export Preview (bottom, code block style)
- Dark code editor-style preview pane (#1E293B background) showing JSON export preview:
```json
{
  "common": {
    "save": { "zh-CN": "保存", "en-US": "Save", "fr-FR": "Enregistrer" },
    "cancel": { "zh-CN": "取消", "en-US": "Cancel", "fr-FR": "Annuler" },
    "delete": { "zh-CN": "删除", "en-US": "Delete", "fr-FR": "Supprimer" }
  }
}
```
- Preview updates in real-time based on selections
- Badge showing "847 entries | ~12.4 KB"

### Section 4: Action Bar (bottom)
- Primary button: "Export & Download" (blue #2563EB)
- Secondary: "Copy to Clipboard"
- Tertiary: "Schedule Export"
- Text hint: "Exports adhere to Standard i18n Schema v2.1"

## Design System
- Primary: #2563EB
- Code preview: dark background #1E293B with green/gold syntax highlighting
- Cards: white bg, #E2E8F0 border, selected card has #2563EB border + #EFF6FF bg
- Font: Inter for UI, JetBrains Mono for code preview
- Clean, professional developer-tool look