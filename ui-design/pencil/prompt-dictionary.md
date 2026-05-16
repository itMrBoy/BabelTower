Create a professional SaaS web application page for an i18n dictionary management tool called "BabelTower".

This is the **Dictionary Search** page — a powerful search and browse interface for all translation entries.

## Layout
- Left sidebar (dark #1E293B, 240px) with navigation: Upload & Parse, Conflict Handling, Dictionary Search (active), Task Snapshots, Export Config
- Top bar with page title "Dictionary" and language pair selector "zh-CN → en-US"
- Main white content area

## Content

### Row 1: Search & Filter Bar
- Large search input with magnifying glass icon, placeholder: "Search keys or translations..."
- Filter chips/dropdowns: Module dropdown (All Modules, common, auth, dashboard, settings), Status dropdown, Language pair selector
- "Advanced Filters" toggle button
- Result count: "Showing 1,247 entries"

### Row 2: Dictionary Table (main area, takes most space)
A data table designed for high-density information with these columns:
- Checkbox (for batch selection)
- Key (monospace font, JetBrains Mono) — expandable tree view
- Module (group header)
- zh-CN (source translation)
- en-US (target translation)
- Status (translated/pending/review)
- Last Updated
- Actions (edit, history, copy)

Show these sample rows grouped by module:

**Module: common** (group header row, light gray bg #F1F5F9, expandable)
- Key: common.save | zh: 保存 | en: Save | Status: translated (green dot) | Updated: 2024-03-15
- Key: common.cancel | zh: 取消 | en: Cancel | Status: translated (green dot) | Updated: 2024-03-14
- Key: common.delete | zh: 删除 | en: Delete | Status: pending (yellow dot) | Updated: —

**Module: auth** (group header)
- Key: auth.login.title | zh: 登录 | en: Log In | Status: translated | Updated: 2024-03-13
- Key: auth.login.submit | zh: 确认登录 | en: Sign In | Status: review (blue dot) | Updated: 2024-03-12
- Key: auth.logout | zh: 退出登录 | en: Log Out | Status: translated | Updated: 2024-03-11
- Key: auth.password.reset | zh: 重置密码 | en: Reset Password | Status: pending | Updated: —

**Module: dashboard** (group header)
- Key: dashboard.title | zh: 仪表盘 | en: Dashboard | Status: translated | Updated: 2024-03-10
- Key: dashboard.overview | zh: 总览 | en: Overview | Status: translated | Updated: 2024-03-09

### Row 3: Pagination (bottom)
- Page info: "Page 1 of 125"
- Previous/Next buttons
- Rows per page selector: 25/50/100

## Design System
- Primary: #2563EB, use alternating row colors (#FFFFFF / #F8FAFC)
- Font: Inter for UI, JetBrains Mono for keys
- Group headers have sticky position
- Status dots: green=translated, yellow=pending, blue=review
- Clean, developer-tool aesthetic with efficient use of space