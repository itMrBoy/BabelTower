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
- [`architecture/frontend-conventions.md`](architecture/frontend-conventions.md) — 全局消息 Provider、ConfirmPopover 二次确认组件、浮层 Portal-to-body 定位约定、不使用 window.confirm、跨页面派生状态须以服务端为单一事实源、跨页面未落库编辑缓冲

## Reference（参考文档）

- [`reference/known-gaps.md`](reference/known-gaps.md) — OpenAPI 一致性（含历史偏差留档）、缺失功能、测试缺口、ESLint 问题、性能隐患、生产配置隐患（AUTH_SECRET 未注入致重启 session 失效）
- [`reference/ci-and-tooling.md`](reference/ci-and-tooling.md) — pnpm 包管理器约定、GitHub Actions CI job 工具链、Docker 构建链（含 pnpm 布局下 prisma 产物 COPY 路径）、关键依赖版本锁定（@redocly/cli）及原因
- [`reference/gitlab-release-pipeline.md`](reference/gitlab-release-pipeline.md) — 自建 GitLab tag 发版流水线（仅 vX.Y.Z 触发、check→build→deploy 全自动，仅 seed_admin 手动）、shell executor 的 chown 归还所有权硬规则、runner 宿主机环境清单（registry-mirrors / docker-compose-v2 / jq+curl）、生产唯一部署路径决策（tag 流水线 + Docker Compose，永不宿主机直跑/云平台；生产 env 全在 docker-compose.yml `environment:` 块，不读 env 文件）、HTTP 直访形态要求 AUTH_COOKIE_SECURE=false、seed_admin 漏点症状与查库确认命令

## Memory（历史记忆）

- `memory/reflections/` — 由 reflector 维护
- `memory/decisions/` — 由 recorder 维护（当前为空）
- [`memory/doc-gaps.md`](memory/doc-gaps.md) — 文档缺口跟踪

## 根目录文档（llmdoc 之外）

- [`../DEPLOYMENT.md`](../DEPLOYMENT.md) — 部署流程、环境配置、Docker/容器命令、生产唯一部署路径声明（GitLab tag 流水线 + Docker Compose，IP+端口直访；已删除手动部署/云平台章节，勿补回）及 CI/自动化说明（运维入口，权威性以源码/镜像为准，命令细节交叉参见 `reference/ci-and-tooling.md`、`reference/gitlab-release-pipeline.md` 与 `startup.md`）

## 启动阅读顺序

见 [`startup.md`](startup.md)
