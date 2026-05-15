Create a professional SaaS web application page for an i18n dictionary management tool called "BabelTower".

This is the **Upload & Parse** page — the main entry point where users upload translation files.

## Layout
- Left sidebar (dark #1E293B, 240px wide) with navigation: Upload & Parse (active), Conflict Handling, Dictionary Search, Task Snapshots, Export Config
- Top bar with page title "Upload & Parse" and language pair selector "zh-CN → en-US"
- Main white content area

## Main Content - Two sections:

### Section 1: File Upload Zone (top half)
- Large dashed-border dropzone area with upload icon (cloud-upload)
- Text: "Drag & drop translation files here, or click to browse"
- Supported formats hint: ".json, .yaml, .csv, .po, .xliff"
- Below: a "Recent Uploads" table with columns: File Name, Language, Entries, Status, Time
- 3 sample rows showing recent uploads with green/orange status badges

### Section 2: Pipeline Status Indicator (bottom half)
- A horizontal 4-step pipeline progress indicator:
  Step 1: Input (File) — green check, showing file icon
  Step 2: Parser — blue processing spinner, "Parsing..."
  Step 3: Standard JSON — gray pending
  Step 4: Conflict Check — gray pending
  Step 5: Database — gray pending
- Arrows connecting each step
- Below the pipeline: a card showing parse results preview (JSON tree format) with key-value pairs like "app.greeting → 你好 / Hello"

## Design System
- Primary color: #2563EB (brand blue)
- Font: Inter for UI text, JetBrains Mono for translation keys/code
- Background: white content area, #F8FAFC secondary bg
- Borders: #E2E8F0
- Sidebar active item has blue left border accent

## Style
Clean, developer-tool aesthetic with high information density. Professional SaaS look.