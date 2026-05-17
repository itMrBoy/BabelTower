# 开发还原检查清单 · Handoff Checklist

> 维护人：赵刚（UI 设计师）
> 目的：把「设计稿 → 实际实现」的差距列出来，给前端开发对照修复，避免再次出现「实现像狗屎」的情况。

---

## 0. 前置约束

任何前端 UI 变更，**必须先打开设计稿对照**：

| 设计源 | 用途 |
| --- | --- |
| `ui-design/pencil/*.pen` + `*-preview.png` | 5 张高保真主页面 |
| `ui-design/prototypes/all-pages.html` | 5 主页面可交互原型 |
| `ui-design/prototypes/closed-loop.html` | 项目 / 双文件 / 字典录入 / 冲突弹窗 / 状态库 / 移动端 |
| `ui-design/design-system.md` | 配色 / 字体 / 间距 / 圆角 / 阴影 token |
| `ui-design/component-architecture.md` | 组件树与 props 契约 |

**不允许自创风格** —— 包括但不限于：字号、颜色、圆角、间距、提示框样式、图标。

---

## 1. 必修项 P0 · 对照用户截图（2026-05-16 08:28）

用户截图反馈了「实现的 UI 像狗屎」。下面是基于截图与设计稿对比，必须立刻修复的问题：

### 1.1 顶部导航完全错乱

**截图现象**：左上角文字堆叠 `BabelTower 上传&解析 / 冲突处理 / 字典检索 / 任务快照 / 导出确认 / BabelTower v0.1.0 UI Designer / 上传&解析`，所有导航项被挤在一起。

**设计稿要求**（参考 `pencil/upload-parse-preview.png`）：
- 侧边栏宽度 `w-60`（240px），暗色 `bg-slate-900`，白色文字
- Logo 区域 32×32 圆角图标 + 「BabelTower」名称
- 导航项纵向排列，每个 `py-2.5 px-3 rounded-md`，激活态左侧 3px 蓝色边
- 顶部主面板有独立 header（`h-14 bg-white border-b`），只放页面标题 + 语言切换

**修复方向**：检查 `src/app/layout.tsx` 是否被覆盖；Sidebar 是否变成横向 flex 把所有项目挤一行。

### 1.2 主标题字号过大、排版崩坏

**截图现象**：「中文基准 i18n 业务工作台」字体超大、宽度占满，比例完全不对。

**设计稿要求**：
- 页面标题用 `text-lg font-semibold text-slate-800`（18px）
- 不允许给中文 H1 用 60px+ 字号
- 主面板 `max-w-5xl mx-auto`，居中限宽

**修复方向**：删除任何自定义大字号 hero 样式；按设计稿使用 `text-lg / text-2xl` 层级。

### 1.3 「请先创建或选择项目」错误提示样式不规范

**截图现象**：粉色背景红色文字横条提示，看起来像浏览器原生 alert。

**设计稿要求**（参考 `closed-loop.html#error-no-project`）：
- 卡片化：白底 + 顶部 `bg-amber-50 border-b border-amber-200` 标识条
- 提示文案分两层：标题 14px 加粗 + 说明 12px 灰色
- 必须配一对操作按钮：「新建项目」（主）+「从已有项目选择」（次）
- **不允许只放一句红色文字让用户卡死**

### 1.4 缺少 Pipeline 5 步可视化

**截图现象**：直接展示 5 个步骤的横向卡片（Input/Parser/Standard JSON/Conflict Check/Database），但样式与设计稿差距很大，没有完成进度、当前步、连接线。

**设计稿要求**（参考 `pencil/upload-parse-preview.png` 的 Pipeline Status）：
- 5 个圆形节点 + 连接箭头
- 节点状态：完成（绿勾）/ 进行中（蓝旋转）/ 待处理（灰色编号）
- 节点下方有 12px 灰色描述文字

### 1.5 整体配色未按设计系统

**设计稿配色**（`design-system.md` 已明确）：
- 背景：`#F1F5F9`（slate-100）
- 主面板：`#FFFFFF`
- 边框：`slate-200`
- 文字主：`slate-800`，次：`slate-500`
- 品牌色：`#2563EB`（brand-500）
- 冲突色：红 `#DC2626` / 黄 `#F59E0B` / 蓝紫 `#6366F1`

**截图问题**：背景偏粉、提示色偏红，明显未走设计 token。

**修复方向**：检查 `globals.css` 是否被改成自定义主题；所有颜色必须通过 Tailwind 设计 token，不允许写死 hex。

---

## 2. 必修项 P0 · 业务功能闭环（开发未实现的设计稿）

以下设计稿已经画完，但当前实现缺失或残缺：

| 缺失 | 设计稿位置 | 备注 |
| --- | --- | --- |
| 项目管理页（列表 + 新建项目对话框） | `closed-loop.html#projects` | 解决用户进入应用就卡在「请先创建或选择项目」 |
| 任务清单（项目维度的最近 + 历史） | `closed-loop.html#project-tasks` | 现有 `Task Snapshots` 是 status 视角，缺少项目入口 |
| 双文件 4 列预览表 | `closed-loop.html#dual-preview` | PRD 5.4 核心功能，前端完全缺失 |
| key 不一致校验列表 | `closed-loop.html#dual-key-mismatch` | 双文件保存前的必修阻断 |
| 字典录入抽屉 | `closed-loop.html#dict-entry` | 单条人工录入入口 |
| 冲突弹窗 · 中文一致英文不同 | `closed-loop.html#conflict-modals` 5.1 | 字典写入阻断 |
| 冲突弹窗 · 相似度 ≥ 90% | `closed-loop.html#conflict-modals` 5.2 | 字典写入阻断 |
| 通用状态库（空/加载/错误/500/成功） | `closed-loop.html#states` | 所有页面共用，禁止自创 |
| 移动端降级 | `closed-loop.html#mobile-fallback` | 查询 + 查看可用，编辑引导回桌面 |
| 导出成功 + 历史导出 | `closed-loop.html#export-success` | 导出后回流 |

---

## 3. 必修项 P0 · 当前实现的「导入 500」

**用户反馈**：导入功能直接报 500。这是后端 / Prisma 的问题，但 UI 必须正确呈现失败状态。

**UI 必须做到的（参考 `closed-loop.html#states` 中的 500 卡片）**：

1. 错误卡片化，红色 header + 错误文案
2. 显示 `traceId`，并提供「复制 traceId」按钮
3. 提供「重试导入」「查看任务历史」两个回退动作
4. 可展开「技术细节」（包含 HTTP method/path/状态码 + 后端错误摘要）
5. **绝对不能让用户看到 Next.js 默认的白屏 500 错误页**

后端的修复路径：见 [@张大彪](mention://agent/ddafbe47-f31e-44b8-8629-aa52738218f1) / [@魏和尚](mention://agent/15189f32-83a6-4ff5-ab3d-47c77ee3f4bb) 的 issue。

---

## 4. 验收口径

前端 PR 合并前，**逐条对照本清单**，自检：

- [ ] 侧边栏 + 主面板布局与 `upload-parse-preview.png` 一致
- [ ] 顶部 header 高度、内容、间距与设计稿一致
- [ ] 所有颜色走 Tailwind brand / slate token，不写死 hex
- [ ] 所有页面都使用了 `closed-loop.html#states` 中的状态组件（空 / 加载 / 错误 / 500 / 成功）
- [ ] 项目管理 + 任务清单（项目维度）页面已实现
- [ ] 双文件模式（4 列预览 + key 校验）已实现
- [ ] 字典录入抽屉 + 两类冲突弹窗已实现
- [ ] Pipeline 5 步可视化按设计稿还原
- [ ] 移动端 viewport 下，编辑场景显示「请在桌面端完成」引导
- [ ] 任意 API 失败都通过统一 ErrorCard 组件呈现，不允许白屏

> 任何一项不满足，UI 设计师拒绝在 PR 上 approve。
