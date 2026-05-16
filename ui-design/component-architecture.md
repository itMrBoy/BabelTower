# BabelTower — Next.js 前端组件架构

## 技术选型

| 层 | 选型 | 理由 |
|---|------|------|
| 框架 | Next.js 14+ (App Router) | 服务端渲染字典检索、静态导出配置页 |
| 样式 | Tailwind CSS + shadcn/ui | 快速落地 Design System，可定制无障碍 |
| 表格虚拟化 | @tanstack/react-virtual | 1000+ 行场景 · 行虚拟化 + 列固定 |
| 表单 | React Hook Form + Zod | 上传配置、导出选项的 Schema 校验 |
| 状态管理 | URL State (nuqs) + React Context | 筛选/分页走 URL，跨页共享走 Context |
| 国际化 | next-intl | App Router 原生支持 |
| 拖拽上传 | react-dropzone | 上传区域拖拽交互 |
| 图表 | 无 | 字典管理工具不需要图表 |

## 目录结构

```
src/
├── app/                          # App Router 页面
│   ├── layout.tsx                # 根布局 (Sidebar + TopBar + 内容区)
│   ├── (main)/
│   │   ├── page.tsx              # 上传 & 解析 (首页)
│   │   ├── conflict/page.tsx     # 冲突处理
│   │   ├── dictionary/page.tsx   # 字典检索
│   │   ├── snapshots/page.tsx    # 任务快照
│   │   └── export/page.tsx       # 导出配置
│   └── api/
│       ├── upload/route.ts       # 文件上传
│       ├── parse/route.ts        # 解析触发
│       ├── conflicts/route.ts    # 冲突 CRUD
│       ├── dictionary/route.ts   # 字典搜索/分页
│       ├── snapshots/route.ts    # 快照列表
│       └── export/route.ts       # 导出文件生成
├── components/
│   ├── ui/                       # shadcn/ui 基础组件 (button, input, table...)
│   ├── layout/
│   │   ├── sidebar.tsx           # 侧边导航
│   │   ├── topbar.tsx            # 顶部栏 (标题 + 语言对选择器)
│   │   └── shell.tsx             # 整体布局壳
│   ├── upload/
│   │   ├── dropzone.tsx          # 拖拽上传区域
│   │   ├── pipeline-steps.tsx    # 流水线步骤指示器
│   │   ├── recent-uploads-table.tsx
│   │   └── parse-result-card.tsx # 解析结果卡片
│   ├── conflict/
│   │   ├── conflict-summary.tsx  # 顶部统计卡片组
│   │   ├── conflict-list.tsx     # 冲突列表 (虚拟滚动容器)
│   │   ├── conflict-row.tsx      # 单条冲突行
│   │   ├── conflict-drawer.tsx   # 冲突详情弹窗
│   │   └── conflict-badge.tsx    # 冲突类型标签
│   ├── dictionary/
│   │   ├── search-bar.tsx        # 搜索 + 筛选栏
│   │   ├── dict-table.tsx        # 虚拟滚动字典表
│   │   ├── dict-row.tsx          # 单行记录
│   │   ├── module-group.tsx      # 模块分组头
│   │   └── translation-cell.tsx  # 可编辑翻译单元格
│   ├── snapshot/
│   │   ├── snapshot-table.tsx    # 快照列表
│   │   ├── snapshot-detail.tsx   # 快照详情面板
│   │   └── pipeline-trace.tsx    # 数据流追踪可视化
│   └── export/
│       ├── format-selector.tsx   # 格式选择 (JSON/YAML/CSV/PO)
│       ├── scope-panel.tsx       # 导出范围配置
│       ├── json-options.tsx      # JSON 特有选项
│       └── export-preview.tsx    # 代码预览
├── hooks/
│   ├── use-dictionary.ts         # 字典数据获取 (分页/搜索/筛选)
│   ├── use-conflicts.ts          # 冲突数据获取与状态管理
│   ├── use-upload.ts             # 上传状态机
│   ├── use-snapshots.ts          # 快照列表
│   └── use-virtual-scroll.ts     # 虚拟滚动封装
├── lib/
│   ├── api.ts                    # API 客户端
│   ├── i18n-schema.ts            # Standard i18n 类型定义
│   ├── conflict-types.ts         # 冲突类型枚举与匹配
│   └── export-formats.ts         # 导出格式配置
└── types/
    └── index.ts                  # 全局 TypeScript 类型
```

## 组件树

```
Shell
├── Sidebar
│   ├── Logo
│   ├── NavItem (上传&解析)
│   ├── NavItem (冲突处理) + Badge
│   ├── NavItem (字典检索)
│   ├── NavItem (任务快照)
│   └── NavItem (导出配置)
├── TopBar
│   ├── PageTitle
│   └── LangPairSelector (语言对: zh-CN → en-US)
└── Content (根据路由渲染)
    │
    ├── [Upload Page]
    │   ├── Dropzone
    │   ├── PipelineSteps (1→2→3→4, 每步状态灯)
    │   └── RecentUploadsTable
    │
    ├── [Conflict Page]
    │   ├── ConflictSummary (4 张统计卡片)
    │   └── ConflictList
    │       └── ConflictRow × N (按类型着色)
    │           └── ConflictDrawer (点击弹出)
    │
    ├── [Dictionary Page]
    │   ├── SearchBar
    │   └── DictTable (virtual scroll)
    │       ├── ModuleGroup (分组头)
    │       └── DictRow
    │           └── TranslationCell × N
    │
    ├── [Snapshot Page]
    │   ├── SnapshotTable
    │   └── SnapshotDetail (选中时展开)
    │       └── PipelineTrace
    │
    └── [Export Page]
        ├── FormatSelector
        ├── ScopePanel
        ├── JsonOptions
        └── ExportPreview
```

## 数据流

```
┌─────────┐    ┌────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│ Dropzone │───▶│ Parser │───▶│ Standard JSON │───▶│ Conflict Check│───▶│ Database │
│ (Input)  │    │ (API)  │    │ (Normalize)  │    │ (4 types)    │    │ (Persist)│
└─────────┘    └────────┘    └──────────────┘    └──────────────┘    └──────────┘
     │              │               │                   │                  │
     └──── 上传进度 ─┘               │                   │                  │
                     └── 标准化结果 ──┘                   │                  │
                                     └── ConflictRow ────┘                  │
                                                          └── 确认/编辑 ─────┘
```

上传页 PipelineSteps 组件监听各个阶段状态：
- Step 1 (解析): 通过 `POST /api/parse` 返回值展示条目数
- Step 2 (标准化): 展示标准化后的 Schema 树
- Step 3 (冲突检测): 有冲突时变黄，显示数量；无冲突变绿
- Step 4 (入库): 仅冲突全部解决后激活

## 虚拟滚动方案 (1000+ 行表格)

使用 `@tanstack/react-virtual` + 固定行高 40px：

```ts
// 核心策略
const tableConfig = {
  rowHeight: 40,           // 行高
  overscan: 10,            // 预渲染行数
  estimateSize: () => 40,  // 匀速估计
  grouping: 'module',      // 按模块分组
  stickyGroups: true,      // 分组头吸顶
};
```

分组/筛选方案：
- 前端分组：字典表格按 `module` 字段 fold，每组带可折叠 Header
- 筛选：URL SearchParams 驱动 (nuqs)，支持 `?lang=zh-CN&module=common&q=submit`
- 排序：点击列头排序，前端排序（千行级别前端完全可承受）

## 移动端适配

桌面端优先，移动端保证可用：

| 断点 | 策略 |
|------|------|
| ≥1024px (桌面) | Sidebar 常驻 240px，双栏/表格全功能 |
| 768-1023px (平板) | Sidebar 折叠为图标模式 64px，表格列可配置显示/隐藏 |
| <768px (手机) | Sidebar 变为底部 TabBar，表格改为卡片堆叠 (Card Stack) 布局 |

关键移动端改动：
- 冲突处理页：Drawer 替代 Side Panel，全屏弹出
- 字典检索：表格列缩减为 key + 当前语言，滑动切换语言
- 导出：Step 表单单列布局
- 上传：全宽 Dropzone，不区分拖拽/点击

## 冲突状态组件交互矩阵

| 冲突类型 | 行样式 | 默认操作按钮 | 详情 Drawer |
|----------|--------|-------------|------------|
| exact_zh_diff_target | 红底 + 左边框 | 保留译文 / 编辑目标 / 忽略 | 并排对比源-目标 |
| high_similarity | 黄底 + 左边框 | 确认正确 / 编辑 | Diff 视图 + 相似度 % |
| duplicate_key | 紫底 + 左边框 | 保留第一个 / 保留第二个 / 合并 | 列出所有出现位置 |
| format_parse_error | 红底 + 虚线框 | 查看原始数据 / 跳过 | 原始输入 + 错误堆栈 |

## 无障碍 (Accessibility)

- 表格行支持键盘导航 (↑↓)，Enter 打开详情
- 冲突类型用图标 + 颜色双重编码（色盲友好）
- 所有交互元素有 focus-visible 样式
- 上传区域支持键盘粘贴（Ctrl+V）触发
- Toast 通知用 role="alert" 读屏
