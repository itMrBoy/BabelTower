---
name: gitlab-ci-runner-pipeline-fix
description: 首次用 .gitlab-ci.yml 打 tag 发版（v0.1.0）连环失败到 v0.1.2 部署成功的完整排障反思：Docker Hub 被墙需 registry-mirrors、shell executor 容器写挂载卷留下 root 残留炸掉 git clean、宿主机缺 docker-compose-v2、Dockerfile COPY .prisma 是 npm→pnpm 迁移漏改死角、nginx server_name 不匹配最终决策改为 IP+端口直访
metadata:
  type: reflection
  date: 2026-06-10
---

# GitLab CI 发版流水线首发排障：四层连环失败与自建 runner 隐性环境依赖反思

项目新增 `.gitlab-ci.yml`（仅 `vX.Y.Z` tag 触发，check→build→deploy 三阶段，shell executor runner 跑在宿主机 sws-manager1，Ubuntu 24.04）。首次打 tag `v0.1.0` 发版，流水线连环失败——四个独立问题逐层暴露（一个修好下一个才显形），直到 `v0.1.2` 才部署成功；部署成功后还遇到 nginx 默认页问题，最终决策为 IP+端口直访。这是继 `2026-06-06-openapi-pnpm-ci-fix`、`2026-06-08-deployment-docs-pnpm-docker-fix` 之后，npm→pnpm 迁移死角的第三次应验（这次轮到 Dockerfile 的 `COPY .prisma` 路径）。

## Task

- 首次通过 `.gitlab-ci.yml` 打 tag `v0.1.0` 走完整发版流水线（check→build→deploy）并部署成功。
- 实际演变为对流水线四个连环故障的逐层排障，外加部署后访问形态的决策。

## Expected vs Actual

- 期望：打 tag 后三阶段顺利跑通，应用可访问。
- 实际：`v0.1.0` 起连环失败四次（镜像拉取被墙 → root 残留炸 git clean → 宿主机无 compose v2 → Dockerfile COPY 路径错误），每修一层暴露下一层；至 `v0.1.2` 部署成功后，80 端口又是 nginx Welcome 页（server_name 不匹配），最终改为 `http://10.2.0.105:3000` 直访收口。

## What Went Wrong（排障时间线）

1. **check 失败：拉不到 `node:24-alpine`。** 报错 `dial tcp 130.211.15.150:443: connect: connection refused`。排查确认宿主机能上网（baidu 200）但 `registry-1.docker.io` timeout——Docker Hub 被墙。修复：宿主机 `/etc/docker/daemon.json` 配 registry-mirrors（`docker.1ms.run` / `docker.m.daocloud.io` / `docker.1panel.live` / `hub.rat.dev` 四个兜底）+ `systemctl restart docker`。仓库零改动。
2. **build 失败：git clean Permission denied。** check 阶段用 `docker run -v $CI_PROJECT_DIR:/app` 跑 `pnpm install`，容器内 root 写入 `.pnpm-store/` 和 `node_modules/`，宿主机 `gitlab-runner` 用户删不掉 → 下个 job 的 git clean 失败，数万行权限告警撑爆 4MB 日志上限。修复（commit `4512898`）：check 的 `after_script` 第一行加 `docker run --rm -v "$CI_PROJECT_DIR":/app node:24-alpine chown -R "$(id -u):$(id -g)" /app` 归还所有权；已有的 root 残留需一次性手动 `rm` 清理。
3. **build 失败：`docker compose` 不存在。** `docker: unknown command: docker compose`——Ubuntu 源安装的 docker 不带 compose v2 插件。修复：宿主机 `apt-get install docker-compose-v2`。
4. **build 失败：Dockerfile `COPY .prisma` not found。** `COPY --from=builder /app/node_modules/.prisma` 是 npm 布局假设；pnpm 布局下 `prisma generate` 产物在 `node_modules/.pnpm/@prisma+client@*/node_modules/.prisma`，根 `node_modules` 下无 `.prisma`。这是之前 npm→pnpm 迁移漏改的死角（`reference/ci-and-tooling.md` 记录过那次迁移但没覆盖这行 COPY）。修复（commit `46b483f`）：COPY 改用通配符路径 `/app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma`。
5. **部署成功后：80 端口是 nginx Welcome 页。** 宿主机 nginx `sites-enabled/babeltower` 配了 `server_name babeltower.snowsse.cn`，用 IP 访问时 Host 不匹配落到 default 站点。最终决策：不用 nginx、不占默认配置，直接 IP+端口访问 `http://10.2.0.105:3000`（docker `-p 3000:3000` 已发布到所有网卡）；后续多应用按端口区分，需要 TLS/域名分流时再引入 nginx。

## Root Cause

- **自建 runner 宿主机的隐性环境依赖从未被清单化。** registry-mirrors、docker-compose-v2、jq/curl（飞书通知用）都是流水线的前置条件，但 `.gitlab-ci.yml` 写好时无人逐项核对宿主机，只能靠失败一个补一个。
- **shell executor + `docker run -v` 挂载工作区的所有权模型没被考虑。** 容器内 root 写挂载卷在宿主机留下 `gitlab-runner` 删不掉的文件，这是 shell executor 的结构性陷阱，写 yaml 时未预判。
- **报错语义未被第一时间细读。** `connection refused` 与 `timeout` 指向不同根因（refused→配置错/防火墙 reject；timeout→被墙），区分二者本可缩短第一层的定位时间。
- **npm→pnpm 迁移的影响面排查仍未覆盖 Dockerfile 每一行 COPY 路径。** 06-06、06-08 两次反思都强调了「工具链切换要覆盖所有入口」，但当时的核对粒度停留在「安装命令/包管理器调用」层，没逐行核对 COPY 的产物路径假设——pnpm 虚拟存储布局与 npm 扁平布局完全不同。
- **仅 tag 触发的流水线放大了验证成本。** CI 修复必须打新 tag 才能验证——retry 旧 tag 跑的是旧 commit 的旧 yaml，修复不生效且可能重新埋雷（如再次产生 root 残留），所以从 `v0.1.0` 一路打到 `v0.1.2`。

## Missing Docs or Signals

- `reference/ci-and-tooling.md` 只写了 GitHub Actions CI，完全没覆盖 `.gitlab-ci.yml` 发版流水线（tag 触发规则、三阶段结构、shell executor）与 runner 宿主机环境要求。
- 缺一份「自建 runner 宿主机环境清单」：registry-mirrors、docker-compose-v2、jq/curl 等隐性依赖无处可查，新 runner 机器无从核对。
- 缺「shell executor 下容器写挂载卷必须归还 uid 所有权」的约定记录——这是 yaml 模板级别的硬规则。
- 部署访问形态（IP:3000 直访、不走 nginx、后续多应用按端口区分）是一次有意决策，但未落入任何稳定文档，后人可能误以为是疏漏而去「补」nginx 配置。

## Promotion Candidates

> 以下交由 recorder 落地到稳定文档，本反思不修改稳定文档或源码。

- `reference/ci-and-tooling.md`：新增「GitLab CI 发版流水线」节——仅 `vX.Y.Z` tag 触发、check→build→deploy 三阶段、shell executor on sws-manager1、**retry 旧 tag 无法验证 yaml 修复，必须打新 tag**、check 阶段 `after_script` 的 chown 归还所有权模式（commit `4512898`）。
- `reference/ci-and-tooling.md` 或独立小节：**runner 宿主机环境清单**——`/etc/docker/daemon.json` registry-mirrors（含四个镜像源兜底）、`docker-compose-v2`、jq/curl（飞书通知）；新 runner 机器按清单逐项核对。
- `reference/ci-and-tooling.md` Docker 构建链节补充：pnpm 布局下 prisma 产物路径为 `node_modules/.pnpm/@prisma+client@*/node_modules/.prisma`（commit `46b483f` 的通配符 COPY），并把「迁移包管理器须逐行核对 Dockerfile COPY 路径」并入既有的「覆盖所有入口」经验。
- `DEPLOYMENT.md`（或 `startup.md`）：记录部署访问形态决策——`http://10.2.0.105:3000` IP+端口直访，不走 nginx；多应用按端口区分；引入 nginx 的触发条件是需要 TLS/域名分流。
- 可独立沉淀的通用经验（供 recorder 判断是否成条）：报错语义区分 `connection refused`（配置/防火墙 reject）vs `timeout`（被墙）；shell executor 下凡容器内写挂载卷必须考虑 uid 归还。

## Follow-up

- recorder 按上述提升候选更新 `reference/ci-and-tooling.md` 与部署文档。
- 若再添置 runner 宿主机，先按环境清单逐项核对再注册 runner，不要等流水线失败逐个补。
- 下次再做工具链/布局类迁移，核对清单要细化到「Dockerfile 每一行 COPY/路径假设」粒度，而非仅命令层。
