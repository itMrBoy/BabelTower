---
name: settings-maintenance-cache-project-reset
description: 修复系统维护功能缓存与项目清理选项后的实现反思
metadata:
  type: reflection
  date: 2026-06-02
---

# 系统维护功能缓存与项目清理反思

## 本次变化

- 字典搜索存在前端页面缓存和服务端 LRU 查询缓存；清空字典或重置系统时必须同时失效两层缓存，否则用户会短暂看到旧搜索结果。
- 快照和字典维护接口改为按依赖顺序显式清理关联数据，不只依赖数据库级联或 SetNull 行为。
- 重置系统新增 `clearProjects` 选项；勾选后清空项目，并连带清理项目下任务、草稿行和任务冲突。

## 可复用经验

- 本项目已有 `pnpm-lock.yaml`，日常安装、类型检查和测试应优先使用 `pnpm`，避免混用 `npm` 破坏依赖状态或触发 Windows DLL 占用问题。
- 维护类写操作如果影响读接口缓存，应把缓存失效能力放到共享模块，由写接口和维护接口共同调用。
- 跨页面缓存失效可以用 `localStorage` stamp 加自定义事件通知当前 tab，避免 Next.js 客户端模块缓存保留旧页面级 LRU。
- 危险操作的响应计数应覆盖可选范围，例如项目、任务、草稿行和冲突，便于用户判断实际清理范围。

## 验证缺口

- 当前环境缺少可用的 `node_modules/.bin`，验证命令无法找到 `tsc`/`vitest`。
- 曾误用 `npm ci`，被 Prisma Windows query engine DLL 占用阻塞；后续应改用 `pnpm install --frozen-lockfile`，依赖恢复后补跑 `pnpm typecheck` 和 `pnpm test -- settings-maintenance`。
