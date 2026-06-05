---
name: ci-and-tooling
description: 包管理器约定、CI job 工具链、关键依赖版本锁定及其原因
metadata:
  type: reference
---

# CI 与工具链约定

## 包管理器：pnpm（强约束）

项目统一使用 pnpm，不再使用 npm：

- `package.json` 声明 `packageManager: "pnpm@10.33.2"`，作为唯一受支持的包管理器。
- 仅保留 `pnpm-lock.yaml`，已删除 `package-lock.json`，不要再生成或提交后者。
- 安装一律用 `pnpm install --frozen-lockfile`，禁止隐式改写 lockfile。
- 脚本调用使用 `pnpm exec` / `pnpm run`（不用 `npx` / `npm run`）。

## CI 配置

`.github/workflows/ci.yml` 含 6 个并行 job：`lint`、`typecheck`、`prisma-validate`、`openapi-validate`、`test`、`build`。

每个 job 的统一前置步骤：

- `pnpm/action-setup@v4` 安装 pnpm。
- `actions/setup-node` 配置 `cache: 'pnpm'` 复用依赖缓存。
- `pnpm install --frozen-lockfile` 安装依赖。

## 关键依赖版本锁定

| 依赖 | 锁定版本 | 锁定原因 |
|------|----------|----------|
| `@redocly/cli` | `1.34.14`（曾为 `^1.0.0`） | 浮动版本在 Node 24 下触发 redoc 包的 `MODULE_NOT_FOUND` 崩溃，固定版本规避 |

## OpenAPI 校验

- `openapi:validate` 脚本为 `redocly lint openapi/babeltower.v1.yaml`。
- 当前校验 0 error（仅余 3 个无害 warning：`info-license`、health/logout 的 `operation-4xx-response`）。
- spec 已对齐实现，详见 `llmdoc/architecture/api-contracts.md` 与 `llmdoc/reference/known-gaps.md`。
