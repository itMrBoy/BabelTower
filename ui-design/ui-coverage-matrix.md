# BabelTower UI 闭环覆盖矩阵

> 维护人：赵刚（UI 设计师）
> 目的：用一张表说清楚 —— **PRD 的每一个功能场景，对应哪些 UI 资产、覆盖到什么状态、是否已闭环**。
> 闭环判定：核心页面 + 关键交互弹窗 + 关键 UI 状态（空 / 加载 / 错误 / 成功）全部有设计稿对应。

---

## 1. 资产说明

| 资产 | 路径 | 说明 |
| --- | --- | --- |
| Pencil 正稿 | `ui-design/pencil/*.pen` + 同名 `-preview.png` | 5 张高保真设计图，桌面端 |
| HTML 原型 v1 | `ui-design/prototypes/all-pages.html` | 5 大主页面可交互原型 |
| HTML 原型 v2（闭环补缺） | `ui-design/prototypes/closed-loop.html` | 项目管理 / 双文件 / 字典录入 / 冲突弹窗 / 任务列表 / 状态页 |
| 设计系统 | `ui-design/design-system.md` | 配色、字体、间距、组件状态 |
| 组件架构 | `ui-design/component-architecture.md` | React 组件树与 props 契约 |
| 开发还原清单 | `ui-design/handoff-checklist.md` | 截图 vs 设计稿的差距、必修项 |

---

## 2. PRD 功能场景 ↔ UI 资产对照

| PRD § | 功能场景 | 主页面设计稿 | 交互弹窗 | 关键状态 | 闭环 |
| --- | --- | --- | --- | --- | --- |
| 5.1 | 字典录入（人工录入新词） | `closed-loop.html#dict-entry` | ConflictModal（中文同英文异） / ConflictModal（中文相似 90%+） | 空 / 已存在提示 / 写入成功 | ✅ |
| 5.2 | 字典搜索（中英双向） | `pencil/dictionary-search.pen` + `all-pages.html#page-dictionary` | 详情侧滑 | 空状态 / 加载 / 命中 / 模糊 / 无结果 | ✅ |
| 5.3 | 翻译页一：单中文文件 | `pencil/upload-parse.pen` + `all-pages.html#page-upload` | 暂存确认 / 同步字典授权 | 上传 / 解析中 / 解析失败 / 预览 / 暂存 / 保存成功 | ✅ |
| 5.4 | 翻译页二：中文 + 英文双文件 | `closed-loop.html#dual-upload` + `closed-loop.html#dual-preview` | key 不一致校验弹窗 / 字典填充冲突弹窗 | 双文件上传 / key 缺失列表 / 4 列预览 / 字典命中高亮 | ✅ |
| 5.5 | 任务清单（项目维度） | `closed-loop.html#projects` + `closed-loop.html#project-tasks` | 新建项目对话框 / 创建任务对话框 | 项目空 / 最近任务 / 历史任务（只读） | ✅ |
| 6 | 数据流可视化 | `all-pages.html#page-upload`（Pipeline Status 组件） | — | Input → Parser → Standard JSON → Conflict Check → Database 五步态 | ✅ |
| 5.3 / 5.4 | 冲突处理 | `pencil/conflict-handling.pen` + `all-pages.html#page-conflict` | 批量处理 / 单条修复 | exact_zh_diff_target / high_similarity / duplicate_key / format_parse_error 四态全色卡 | ✅ |
| 5.3 / 5.4 | 任务快照（暂存） | `pencil/task-snapshots.pen` + `all-pages.html#page-snapshot` | — | Success / Partial / Failed | ✅ |
| 5.3 / 5.4 | 导出 | `pencil/export-config.pen` + `all-pages.html#page-export` | 导出预览 / 导出成功 | JSON / YAML / CSV / PO 四格式 + 范围筛选 | ✅ |

---

## 3. 关键 UI 状态闭环

每个主页面都必须画清楚以下 4 种状态。本轮已统一补齐：

| 状态 | 设计稿位置 |
| --- | --- |
| 空状态（首次进入 / 无项目 / 无数据） | `closed-loop.html#empty-states` |
| 加载状态（解析中 / 请求中 / 大表格虚拟滚动占位） | `closed-loop.html#loading-states` |
| 错误状态（解析失败 / 网络失败 / 400 / 500） | `closed-loop.html#error-states` |
| 成功状态（保存 / 导出 / 字典写入） | `closed-loop.html#success-states` |

> 用户截图（2026-05-16 08:28）反馈的「请先创建或选择项目」红色提示属于「错误状态 - 缺前置依赖」类型，本轮已纳入 `closed-loop.html#error-no-project` 提供正式的引导式视觉规范，开发需按此还原而非自创红框。

---

## 4. 响应式覆盖

| 断点 | 行为 | 设计稿 |
| --- | --- | --- |
| ≥ 1280px（桌面优先） | 侧边栏 + 主面板，编辑表全列 | 所有 Pencil + HTML v1/v2 |
| 768 ~ 1279px（平板） | 侧边栏可折叠，编辑表可横滚 | `closed-loop.html` 含 viewport 适配 |
| < 768px（移动） | 侧边栏抽屉式，关键路径：搜索 / 查看任务 / 查看冲突摘要；编辑流程提示「请在桌面端完成」 | `closed-loop.html#mobile-fallback` |

---

## 5. 之前缺口 → 本轮补齐对照

| 缺口（本轮之前） | 现状 |
| --- | --- |
| 没有项目管理页（用户截图直接卡在「请先创建或选择项目」） | ✅ `closed-loop.html#projects` 项目列表 + 新建项目对话框 |
| 没有字典录入专属界面（PRD 5.1 只在表格里隐含） | ✅ `closed-loop.html#dict-entry` 录入抽屉 + 两类冲突弹窗 |
| 没有双文件模式 4 列编辑表（PRD 5.4 核心功能） | ✅ `closed-loop.html#dual-preview` |
| 没有 key 不一致的校验错误列表 | ✅ `closed-loop.html#dual-key-mismatch` |
| 没有「最近任务 vs 历史任务」分组视图 | ✅ `closed-loop.html#project-tasks` |
| 没有空 / 加载 / 错误 / 500 全套状态 | ✅ `closed-loop.html` 集中状态库 |
| 没有移动端示意 | ✅ `closed-loop.html#mobile-fallback` |
| 没有导出后回流（成功提示 + 历史导出条目） | ✅ `closed-loop.html#export-success` |

---

## 6. 给开发的还原硬约束

为避免再次出现「实现的 UI 像狗屎」的情况，开发还原必须遵循 [handoff-checklist.md](./handoff-checklist.md)。当前主线实现与设计稿的具体差距与必修项已逐条列出。
