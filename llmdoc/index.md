---
name: index
description: BabelTower llmdoc 全局文档地图
metadata:
  type: index
---

# llmdoc 索引

## MUST（每次启动必读）

- [`must/project-context.md`](must/project-context.md) — 项目是什么、核心目标、技术栈、关键术语、最重要的架构决策
- [`must/data-flow.md`](must/data-flow.md) — 从文件导入到字典保存到导出的完整数据流、模型关系、状态转换

## Overview（项目概览）

- [`overview/project-overview.md`](overview/project-overview.md) — 项目背景、功能模块、页面路由映射、技术栈详情

## Architecture（架构文档）

- [`architecture/domain-engine.md`](architecture/domain-engine.md) — Standard JSON 中间结构、解析器架构、冲突检测引擎（Jaro-Winkler）、导出器、保存服务
- [`architecture/api-contracts.md`](architecture/api-contracts.md) — 所有 API 端点、请求/响应契约、版本并发控制、降级模式
- [`architecture/data-model.md`](architecture/data-model.md) — Prisma Schema 核心模型、中文去重机制、事务模式、降级存储
- [`architecture/frontend-conventions.md`](architecture/frontend-conventions.md) — 全局消息 Provider、ConfirmPopover 二次确认组件、浮层 Portal-to-body 定位约定、不使用 window.confirm

## Reference（参考文档）

- [`reference/known-gaps.md`](reference/known-gaps.md) — OpenAPI 与实现不一致、缺失功能、测试缺口、ESLint 问题、性能隐患

## Memory（历史记忆）

- `memory/reflections/` — 由 reflector 维护
- `memory/decisions/` — 由 recorder 维护（当前为空）
- [`memory/doc-gaps.md`](memory/doc-gaps.md) — 文档缺口跟踪

## 启动阅读顺序

见 [`startup.md`](startup.md)
