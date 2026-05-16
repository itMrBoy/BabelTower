# BabelTower Design System

## 视觉方向定位

BabelTower 是面向开发者和本地化团队的专业 i18n 字典管理工具。视觉方向定为 **"Precision Dashboard"** — 融合开发者工具的精确感和 SaaS 产品的可用性。

### 为什么选择这个方向？

| 维度 | 决策 |
|------|------|
| 用户画像 | 开发者 + 翻译运营，习惯 CLI/IDE 风格，但需要更友好的视觉引导 |
| 核心场景 | 高频表格操作、状态识别、批量处理 — 信息密度要求高，但不可混乱 |
| 行业参照 | Lokalise / Crowdin / Phrase 均采用高对比度、功能优先风格 |
| BabelTower 定位 | 多端语料资产管理，强调"字典"概念 — 偏理性、结构化、可信赖 |

## 色彩系统

```
Primary (品牌蓝)  : #2563EB  — 主按钮、链接、选中态
Primary Light     : #EFF6FF  — 选中行背景
Primary Dark      : #1D4ED8  — hover 态

Success (已翻译)  : #16A34A  — 完成状态、匹配成功
Warning (待处理)  : #F59E0B  — high_similarity 冲突
Danger  (错误)    : #DC2626  — parse error、exact_zh_diff_target
Info    (信息)    : #6366F1  — duplicate_key 标记

Neutral:
  bg-primary      : #FFFFFF  — 内容区底色
  bg-secondary    : #F8FAFC  — 卡片/表格交替行
  bg-tertiary     : #F1F5F9  — 禁用态/占位
  border          : #E2E8F0  — 分割线、边框
  text-primary    : #0F172A  — 正文
  text-secondary  : #475569  — 辅助文字
  text-muted      : #94A3B8  — 占位符、禁用文字

Sidebar            : #1E293B  — 侧边导航背景
Sidebar-text       : #CBD5E1  — 侧边导航文字
Sidebar-active     : #2563EB  — 侧边导航选中指示
```

## 字体

| 用途 | 字体栈 | 说明 |
|------|--------|------|
| UI 界面 | `Inter, system-ui, -apple-system, sans-serif` | 现代几何无衬线，屏幕阅读清晰 |
| 代码/Key | `JetBrains Mono, Fira Code, monospace` | 翻译 Key 和代码片段 |
| 中文 | 跟随系统：PingFang SC / Microsoft YaHei | Inter 对中文回退 |

层级：
- Heading: 24/20/16px, semibold
- Body: 14px, regular
- Caption: 12px, regular/medium
- Code key: 13px, monospace medium

## 间距 & 布局

- 基础单位: 4px (4/8/12/16/20/24/32/48/64)
- 页面最大宽度: 1440px 居中
- 表格行高: 40px 紧凑 / 48px 舒适（默认紧凑，可切换）
- 侧边栏宽度: 240px（可折叠至 64px 图标模式）

## 图标

- Lucide Icons — 轻量、线条风格，与 Inter 字体气质匹配
- 冲突状态使用语义色 + 不同图标形状区分（非仅依赖颜色）

## 冲突状态视觉方案

| 状态 | 颜色 | 图标 | 行背景提示 |
|------|------|------|-----------|
| exact_zh_diff_target | Red #DC2626 | `AlertTriangle` | 浅红底 + 左边框 |
| high_similarity | Amber #F59E0B | `GitCompare` | 浅黄底 |
| duplicate_key | Indigo #6366F1 | `Copy` | 浅紫底 |
| format_parse_error | Red #DC2626 | `FileX` | 浅红底 + 虚线边框 |

每种冲突行 hover 时展示 tooltip 摘要，点击弹出详情 Drawer。

## 暗色模式

- 提供跟随系统的暗色/亮色切换
- 暗色模式下饱和度降低 20%，保证长时间操作的视觉舒适度
