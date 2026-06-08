---
name: deployment-docs-pnpm-docker-fix
description: 校对 README/部署指南时效性时，发现并修复 Docker 构建链根本跑不通（npm ci 无 package-lock）、pnpm 约定漏覆盖 Docker 入口、standalone 容器内无 pnpm、db push 命令三处不一致、compose profiles 同端口冲突、dev 脚本端口漂移等一连串文档与代码漂移的反思
metadata:
  type: reflection
  date: 2026-06-08
---

# 部署文档校对：Docker 链不可用、pnpm 约定漏覆盖入口、容器命令陷阱反思

本次起于「检查 README 与部署指南的时效性/准确性」，但真正读了 `Dockerfile` 与确认仓库 lockfile 后，发现 README/DEPLOYMENT 宣称的「首选 Docker 启动路径」实际从未跑通，连带牵出 pnpm 工具链约定的死角、standalone 容器命令陷阱、以及同一操作命令在三处文档各写各的漂移。这是 `2026-06-06-openapi-pnpm-ci-fix` 与项目记忆 `verify-against-source-not-docs` 的又一次应验。

## Task

- 用户要求核查 README 与部署指南是否仍然时效、准确。
- 实际范围扩展为修复一整条「文档宣称可用、但部署链实际不可用」的链路。

## Expected vs Actual

- 期望：文档与现状基本一致，至多个别命令需要小修。
- 实际：文档描述的首选启动方式（Docker）从一开始就跑不通；pnpm 强约束只覆盖了本地与 CI、漏掉 Docker 构建入口；同一 `db push` 操作在三处文档三种写法且部分在容器内会失败；compose 命令存在端口冲突陷阱；`dev` 脚本端口与全项目其余配置不一致。

## What Went Wrong（发现的问题）

- **P0：Docker 构建链根本跑不通。** `Dockerfile` 与 `Dockerfile.dev` 都用 `npm ci` + `COPY package.json package-lock.json* ./`，但仓库只有 `pnpm-lock.yaml`、**没有** `package-lock.json`，`npm ci` 必然失败。修复：改为 `corepack enable` + `pnpm install --frozen-lockfile`；并清理 `Dockerfile` 里从未被 `COPY --from=deps` 引用的死 `deps` 阶段（`deps->builder->runner` 改为两阶段 builder->runner）。
- **pnpm 强约束有死角。** 2026-06-06 那次已把 CI 6 个 job 全切 pnpm、删了 `package-lock.json`，却遗漏了 `Dockerfile`/`Dockerfile.dev` 这条构建入口。
- **standalone 运行镜像内不含 pnpm。** runner 阶段只全局 `npm install -g prisma`，并无 pnpm。但 README 和 `llmdoc/startup.md` 都写了 `docker compose exec app pnpm exec prisma db push`，在容器内会失败；正确应使用裸 `prisma db push`。
- **同一操作命令三处不一致。** `db push` 在 README 写 `pnpm exec prisma`、DEPLOYMENT 写 `npx prisma`、容器内应是裸 `prisma`——各文档各自演进、缺乏统一校验。
- **compose profiles + 同端口冲突陷阱。** `app`（无 profile）与 `app-dev`（`profiles:[dev]`）都绑 3000 端口。`docker compose --profile dev up -d`（不点名服务）会同时启动 app 与 app-dev，导致 3000 端口冲突；正确命令必须点名服务：`docker compose --profile dev up -d app-dev`。`startup.md` 第 53 行原本是对的，但 DEPLOYMENT.md 与 compose 注释里是错的，已修正。
- **`package.json` `dev` 脚本端口漂移。** 原硬编码 `127.0.0.1:65432`，与 `.env.example`/compose/`ci.yml` 的 5432 全不一致，已统一为 5432；`ci:check` 内部的 `npm run` 也改为 `pnpm run`。

## Root Cause

- **未被 CI 验证的链路会长期带病。** `.github/workflows/ci.yml` 里**没有任何 docker build job**，所以「npm ci 无 lockfile」这条死链从未被暴露——直到有人真正去读 Dockerfile。
- **工具链约定只覆盖部分入口。** pnpm 强约束在切换时只想到了「本地 + CI」，没把「Docker 构建」「容器运行时」当作同类入口一并处理，于是留下死角。
- **文档随各自演进，无统一事实源校验。** 同一 `db push` 在不同文档不同时间被各自更新，没有以源码/镜像实际能力为准做一次性对齐，于是三处三种写法。
- **以文档为准而非源码。** README/DEPLOYMENT 宣称的首选路径若只读文档不会发现问题，只有读 `Dockerfile` + 确认仓库 lockfile + 看 runner 阶段装了什么，才发现链路不可用与容器内命令受限。

## Missing Docs or Signals

- 缺一个 docker build（乃至 compose up 冒烟）的 CI job，使 Docker 链没有自动信号。
- 缺「宿主机命令 vs 容器内命令」的明确区分说明（standalone 镜像可用命令受限）。
- 缺 compose profiles 行为说明：无 profile 的服务总会启动 + 同端口服务不可同时起，命令需点名服务名。
- `llmdoc/reference/known-gaps.md` 把「Prisma config 复制」记为伪缺口，实际 `prisma.config.ts` 是必需，是又一处文档滞后信号。

## Promotion Candidates

> 以下将由 recorder 落地到稳定文档，本反思不修改稳定文档或源码。

- `reference/ci-and-tooling.md`：新增「Docker 构建链」节（`corepack enable` + `pnpm install --frozen-lockfile`；runner 阶段无 pnpm、全局装 prisma，故容器内用裸 `prisma`）。
- `reference/known-gaps.md` 第 105 行「Prisma config 复制」伪缺口改写（`prisma.config.ts` 实为必需）。
- `reference/doc-gaps.md` 的「运维文档 / CI-CD 文档」两条勾掉并指向 `DEPLOYMENT.md` / `ci-and-tooling.md`。
- `startup.md` 容器命令去掉 `pnpm exec`；`overview/project-overview.md` 的 `deps->builder->runner` 改为两阶段 builder->runner。
- 可独立沉淀的通用经验（供 recorder 判断是否成条）：包管理器/工具链约定要**覆盖所有入口**（本地、CI、Docker 构建、容器运行时），并尽量让 CI 能验证每条入口；standalone 精简镜像内可用命令受限，跨「宿主机 vs 容器内」必须区分命令；compose profiles 与「无 profile 服务总启动 + 同端口」组合需点名服务名。

## Follow-up

- recorder 按上述「提升候选」更新稳定文档。
- 建议后续给 CI 增加一个 docker build / compose up 冒烟 job，让 Docker 链不再无人验证。
- 下次做「工具链切换」类变更时，先列出全部入口（本地 / CI / Docker 构建 / 容器运行时 / 各文档命令），逐一对齐再收口。
