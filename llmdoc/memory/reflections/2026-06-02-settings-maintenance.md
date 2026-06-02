---
name: settings-maintenance
description: 新增系统配置维护页后的实现反思
metadata:
  type: reflection
  date: 2026-06-02
---

# 系统配置维护页反思

## 本次变化

- 新增 `/settings` 系统配置页，提供清空字典库、清空快照、重置快照和字典三类危险操作。
- 新增 `POST /api/settings/maintenance`，沿用数据库优先、内存降级的 API 模式。
- `local-store.ts` 新增定向清理函数，避免只能整库清空内存数据。

## 可复用经验

- 维护类 API 也要和业务 API 一样显式区分数据库存储和内存存储，响应中保留 `storage` 和 `localFallback` 方便前端提示。
- 删除字典和快照时应尊重关系语义：字典删除让冲突的 `dictionaryId` 置空，快照删除级联删除绑定快照的冲突记录。
- 前端危险操作不要直接调用 API，应先展示二次警示，说明影响范围和当前存储模式的差异。

## 验证缺口

- 当前环境依赖不完整，类型检查因缺少 `tsc` 失败；不要使用 `npm ci`，应优先使用 `pnpm install --frozen-lockfile`。
- 后续如继续维护该区域，应在依赖恢复后补跑 `pnpm typecheck` 和相关 API 测试。
