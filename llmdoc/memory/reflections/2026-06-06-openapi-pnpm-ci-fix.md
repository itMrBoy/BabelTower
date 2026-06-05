---
name: openapi-pnpm-ci-fix
description: 修复 CI 的 OpenAPI Validation 崩溃（redoc Cannot find module yaml）、CI 全面切换 pnpm、并以 route handler 源码为准重写对齐 OpenAPI spec 的反思
metadata:
  type: reflection
  date: 2026-06-06
---

# OpenAPI 校验崩溃修复、CI 切 pnpm 与 spec 对齐源码反思

本次起于 CI 的 OpenAPI Validation job 报 `Cannot find module 'yaml'`（redoc 包 MODULE_NOT_FOUND），`npx @redocly/cli lint` 在 Node 24 下根本没跑到规则校验就崩溃。修复牵出两层根因：CI 包管理器与项目约定不一致、以及 redocly recommended 规则集对接口的鉴权与契约偏差报错。最终：6 个 CI job 全面切 pnpm、固定 @redocly/cli 版本、删除 package-lock.json、并以 route handler 源码为唯一事实源完整重写 OpenAPI spec，`redocly lint` 从崩溃→0 error。

## 值得保留的经验

- **判断项目能力/契约，必须以源码为唯一事实源；窄搜索会漏判，llmdoc 文档也可能过时——这是本次最重要的教训。** 我一开始只 grep 了常见中间件鉴权模式（`getServerSession`/`withAuth`/`Authorization`/`jwt`），没命中就误判「项目无鉴权」，据此打算关掉 redocly 的 `security-defined` 规则并新建了 `redocly.yaml`。被用户拦截：「存在致命偏差，有鉴权有登录，只不过没有放在中间件里做」。复查证实项目用 cookie session 鉴权（`src/lib/auth.ts` 的 `requireUser`/`requireAdmin`/`getCurrentUserFromRequest`，HMAC-SHA256 签名的 `babeltower_session` cookie），鉴权在**每个 route handler 内部**调用，而非 Next 中间件层——所以按中间件模式搜索必然落空。更糟的是当时 `llmdoc/reference/known-gaps.md` 还写着「无登录页面、所有 API 路由公开可访问」，文档本身已严重过时，若信文档会进一步坐实错误判断。教训：用「能力不存在」作结论前，必须用足够宽的关键词遍历、或直接精读 route handler 源码核实；不能因一种实现位置（中间件）搜不到就推断整类能力缺失；llmdoc 文档是参考不是事实源，与源码冲突时以源码为准。后续撤销关规则的方案，改为正确补全 `cookieAuth` securityScheme + 全局 `security` + 公开接口 `security: []`。

- **CI 包管理器要与项目约定一致。** `startup.md` 写明用 `pnpm install --frozen-lockfile`，CI 却用 `npm ci` + 浮动版本 `@redocly/cli@^1.0.0`，且仓库里 `package-lock.json` 与 `pnpm-lock.yaml` 并存。Node 24 下 npm 装出异常依赖树正是 redoc 加载崩溃的直接诱因。修复：6 个 job 统一 `pnpm/action-setup@v4` + `setup-node` cache `'pnpm'` + `pnpm install --frozen-lockfile` + `pnpm exec`/`pnpm run`；删除 `package-lock.json`；`package.json` 加 `packageManager: "pnpm@10.33.2"`。两套 lockfile 并存是隐患，应只保留一套并与 CI 一致。

- **工具链版本要锁定到具体版本，不用浮动范围。** `@redocly/cli@^1.0.0` 这种范围会随时间装到不同实际版本，在新 Node 上踩不可复现的依赖崩溃。本次固定为 `1.34.14`，并把命令从 `npx @redocly/cli lint` 改为 `redocly lint openapi/babeltower.v1.yaml`（走已装依赖，不再 npx 临时拉取）。校验/构建类工具尤其要钉死版本。

- **OpenAPI 3.1 不支持 3.0 的 `nullable: true`。** 重写后 `struct` 规则报了 29 个 error，全是 `nullable` 残留。3.1 须改用联合类型 `type: [string, "null"]`（注意 `"null"` 要带引号）。本次用脚本批量转换了 29 处。另有一处 description 文本含 `resolution: UPDATE_DICTIONARY`，其中「冒号+空格」让 YAML 解析失败，需给该字符串加引号或改写。写/迁移 OpenAPI 时先确认 `openapi:` 版本号，再决定可空写法。

- **大规模对齐 spec 与实现时，靠并行精读源码比凭印象补写可靠。** 本次派 4 个 Explore 子代理并行精读全部约 23 个 route handler，据此补齐 10 个缺失接口（`/auth/*`、`/account`、`/users/*`、`/projects/{id}` PATCH/DELETE、`/tasks/{id}/conflicts`、`/settings/maintenance`）并修正 13 处契约偏差（导出响应是 JSON 而非 zip、`PreviewRow` 用 `sourceValue`/`translatedValue`/`conflictLevel`、`StandardI18nDocument` 是含 `source`/`target` 的对象、`ConflictCheckRequest` 用 `entries`、`ConflictCheckResponse` 用 `conflictSummary`、`DictionarySearch` 去 `matchType`/`score`、`ValidationResponse` 用 `validationErrors`+`unresolvedBlocking`、`TaskStatus` 补 `IN_REVIEW`/`FAILED`、`FileFormat` 补 `TS`、`ConflictResolution` 去 `UNRESOLVED` 等）。

## 验证记录

- `redocly lint openapi/babeltower.v1.yaml` 演进：崩溃（Cannot find module 'yaml'）→ 16 error（`security-defined`）→ 29 error（3.1 `nullable` 残留）→ **最终 0 error**，仅余 3 个无害 warning：`info-license`、health/logout 的 `operation-4xx-response`（经用户决定保留，健康检查与登出无 4xx 语义）。
- `pnpm install --frozen-lockfile` 一致通过，确认 lockfile 与 `package.json` 对齐、CI 与本地一致。
- CI 6 个 job 已统一为 pnpm 工具链（`pnpm/action-setup@v4` + cache `'pnpm'` + `--frozen-lockfile` + `pnpm exec`/`pnpm run`）。
- 关键纠偏由用户拦截触发：撤销了误判下新建的 `redocly.yaml` 与关闭 `security-defined` 的方案，改为正确补全鉴权安全定义。

## 文档提升

以下已由 recorder 完成，此处仅作记录：

- `reference/known-gaps.md`：删除过时的「无鉴权 / 所有 API 公开可访问」小节；OpenAPI 一致性段改为「已以 route handler 源码为准完整重写并对齐」；13 处契约偏差转入「历史偏差（已于本次重写修复）」留档表。
- `architecture/api-contracts.md`：原「spec 与实现差异」段改为「已对齐」，并补充 `cookieAuth`（cookie 内 `babeltower_session`）与各接口 `security` 标注。
- 新建 `reference/ci-and-tooling.md`：记录 pnpm 为唯一包管理器约定、6 个 CI job 工具链、`@redocly/cli` 等关键依赖固定版本及原因。
- `index.md`、`overview/project-overview.md` 同步上述变更。
- 仍可考虑沉淀的通用经验（供 recorder 判断是否独立成条）：判断「某能力是否存在」前以源码核实、不以单一搜索模式或可能过时的 llmdoc 下结论；OpenAPI 3.1 可空字段用 `type: [X, "null"]`。
