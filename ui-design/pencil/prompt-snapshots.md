Create a professional SaaS web application page for an i18n dictionary management tool called "BabelTower".

This is the **Task Snapshots** page — showing history of all data import/processing tasks with detailed traceability.

## Layout
- Left sidebar (dark #1E293B, 240px) with navigation: Upload & Parse, Conflict Handling, Dictionary Search, Task Snapshots (active), Export Config
- Top bar with page title "Task Snapshots" and language pair selector "zh-CN → en-US"
- Main white content area

## Content - Split layout (left 60% + right 40%)

### Left Panel: Snapshot List Table
A table of historical tasks with columns:
- Task ID (short UUID)
- File Name
- Entries (count)
- Status (success green / failed red / partial yellow)
- Created At
- Duration

Show these sample rows:
1. TASK-4A2B | app_v3.2.json | 847 entries | Success (green badge) | 2024-03-15 14:32 | 2.3s
2. TASK-3F1C | common.yaml | 1,203 entries | Success (green badge) | 2024-03-14 09:15 | 3.1s
3. TASK-2E0D | errors.po | 56 entries | Partial (yellow badge) | 2024-03-13 16:48 | 1.2s — 3 conflicts
4. TASK-1B9A | legacy.csv | 342 entries | Failed (red badge) | 2024-03-12 11:20 | 0.8s — parse error
5. TASK-0C8B | dashboard.xliff | 215 entries | Success (green badge) | 2024-03-11 08:05 | 1.5s

Row 1 (TASK-4A2B) is selected/highlighted with blue background.

### Right Panel: Snapshot Detail (slide-in panel)
Showing details for the selected task (TASK-4A2B):
- Header: "Task TASK-4A2B Details"
- Data Flow Pipeline visualization (vertical timeline):
  Step 1: File Uploaded — app_v3.2.json (847 entries) — ✓ Complete at 14:32:01
  Step 2: Parsed — JSON parser v2 — ✓ 847/847 entries parsed at 14:32:02
  Step 3: Standardized — Schema validation passed — ✓ at 14:32:03
  Step 4: Conflict Check — 0 conflicts found — ✓ Clean at 14:32:03
  Step 5: Database Write — 847 entries written — ✓ Complete at 14:32:03
- Each step has a connected line/timeline with green checkmarks
- Below: Statistics card showing:
  - Total entries: 847
  - New keys: 124
  - Updated: 723
  - Conflicts: 0
  - Processing time: 2.3s

## Design System
- Primary: #2563EB, Success: #16A34A, Warning: #F59E0B, Danger: #DC2626
- Font: Inter for UI, JetBrains Mono for task IDs and code
- Timeline uses colored dots connected by vertical line
- Selected row highlighted with light blue background (#EFF6FF)
- Clean, developer-tool aesthetic