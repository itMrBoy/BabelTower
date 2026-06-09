---
name: doc-gaps
description: 文档系统中的已知缺口与待办项
metadata:
  type: memory
---

# 文档缺口

## 当前缺口

- [ ] **指南文档**：尚无 workflow 指南（如 "如何添加新文件格式"、"如何调试冲突检测"）
- [ ] **前端架构文档**：页面组件结构、状态管理细节（首页工作区状态实为模块级内存变量 `workspaceStateCache`，刷新即丢失，非 localStorage 持久化——原「localStorage 持久化策略」表述已证伪并于 `overview/project-overview.md` 状态管理表修正）；跨页面派生状态同步与未落库编辑缓冲约定已补入 [`architecture/frontend-conventions.md`](../architecture/frontend-conventions.md)
- [ ] **测试文档**：测试策略、fixtures 说明、性能预算维护指南
- [x] **运维文档：部署流程 + 环境配置**：已由根目录 [`DEPLOYMENT.md`](../../DEPLOYMENT.md) 覆盖
- [ ] **运维文档：监控与告警**：仍缺失
- [x] **CI/CD 文档**：已由 [`reference/ci-and-tooling.md`](../reference/ci-and-tooling.md) 与 `DEPLOYMENT.md` 的「CI/自动化」覆盖

## 已记录的实现缺口

实现层面的缺口详见 [`reference/known-gaps.md`](../reference/known-gaps.md)。
