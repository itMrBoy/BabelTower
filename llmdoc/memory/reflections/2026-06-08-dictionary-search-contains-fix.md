---
name: dictionary-search-contains-fix
description: 修复字典检索回归 bug——搜「安全」搜不出中间含「安全」的中文字段。根因是提交 d32489c 为蹭 B-tree 索引把 length>=2 的搜索从 contains 改成 startsWith，破坏了包含搜索语义；统一改回 contains、补 8 个 API 测试锁死回归、留 trigram 升级路标，并记下「为蹭索引把包含搜索改前缀搜索」的反模式与注释维护教训的反思
metadata:
  type: reflection
  date: 2026-06-08
---

# 字典检索回归修复：为蹭索引把 contains 改 startsWith 破坏包含语义反思

本次起于用户报告字典检索 bug——搜两个汉字「安全」搜不出大量中间含「安全」的中文字段（如「办公安全空间」「为了保护您的账号安全…」），但搜单字「安」却能搜出来。读 `src/app/api/dictionaries/route.ts` GET 路由后定位到根因：提交 `d32489c`（commit message 是 `fix(ui): 字典检索按钮统一 h-10 + 接口性能优化`）为了蹭 `normalizedChinese/normalizedEnglish` 的 B-tree 索引，把查询长度 >= 2 的搜索从 `contains` 偷换成 `startsWith`，从根本上破坏了「包含搜索」语义。这是「为不存在的性能问题做优化、反而破坏正确性」的典型，也再次印证项目记忆 `verify-against-source-not-docs` 与反复出现的「性能优化引入正确性回归」模式。

## Task

- 用户报告：字典检索搜「安全」（2 个汉字）漏掉大量中间含「安全」的记录，搜单字「安」却正常。
- 实际范围：定位回归根因、与用户对齐修复方案（contains 是否会在 2 万条数据量下有性能问题）、补齐此前完全缺失的搜索路由测试、并留下未来数据增长后的索引升级路标。

## Expected vs Actual

- 期望：字典搜索是「包含搜索」，`q` 出现在字段任意位置（开头/中间/结尾）都应命中；搜「安」与搜「安全」语义一致，只是更具体。
- 实际：搜「安」（1 字，length < 2，走 `contains`）能命中中间含「安」的记录；搜「安全」（2 字，length >= 2，走 `startsWith`）只能命中**以「安全」开头**的记录，中间/结尾命中的全部漏掉。同一个搜索框因查询长度不同走了两套语义，用户无从感知。

## What Went Wrong

- **回归根因：`contains` 被偷换成 `startsWith`。** 提交 `d32489c` 以「接口性能优化」之名，把 length >= 2 的查询从 `contains`（`LIKE '%x%'`，包含）改成 `startsWith`（`LIKE 'x%'`，前缀），意图是「利用 `normalizedChinese/normalizedEnglish` 的 B-tree 索引加速」。但前缀匹配与包含匹配是两种语义，改完功能就坏了。
- **本地降级路径与主路径行为不一致，本可早暴露。** `src/lib/local-store.ts` 的 `listLocalDictionaries` 始终用 `.includes()`（contains 语义），与数据库主路径的 `startsWith` 分叉——同一搜索在「连库」和「降级」两条路下结果不同，这本身就是 `startsWith` 是回归 bug 的佐证，但因无测试覆盖未被发现。
- **注释与已删实现漂移（用户当场提出）。** 初版修复在 `route.ts` 注释里用 "A prefix-only startsWith would miss..." 举反例，措辞像在影射代码里曾有/仍有 startsWith 实现，属于不一致隐患；已改写为纯语义描述（不点已删除的实现名）：注释只说明「包含搜索必须命中字段任意位置，如『安全』要能找到『办公安全空间』」。

## Root Cause

- **核心性能误区：B-tree 索引只能加速前缀查询，不能加速包含查询。** B-tree 本质是按序排列（像电话簿），能快速定位「以 x 开头」（`startsWith` / `LIKE 'x%'`），但无法定位「中间含 x」（`contains` / `LIKE '%x%'`）。作者为了让搜索蹭上 B-tree 的快车道，把包含搜索硬塞成前缀搜索——索引确实用上了，但搜出来的已经不是用户要的结果。这是「为蹭索引牺牲正确性」的反模式。
- **为一个并不存在的性能问题做优化。** 当前 50 条 / 预期 2 万条数据量下，`contains` 顺序扫描是个位数~十几毫秒级，叠加前后端双层缓存（前端 LRU 20 条 / 60s、后端 LRU 50 条 / 30s）兜底，用户根本无感。真正的性能拐点要到约 10 万行才会显现，根本轮不到用偷换语义的方式去优化。
- **搜索路由零测试，回归无任何拦截。** 该 GET 路由此前完全没有测试（`tests/api/` 下只有 `settings-maintenance.test.ts`），`contains -> startsWith` 这种「编译通过、类型正确、语义错误」的改动没有任何自动信号，只能等用户在生产里搜不到东西才暴露。

## Missing Docs or Signals

- 缺搜索路由的契约测试，使「搜索必须是包含语义」这条不变式没有被锁死，回归无信号。
- 缺一条明确的工程经验沉淀：「B-tree 索引只能加速前缀查询、不能加速包含查询」，否则后人极可能再次把 `contains` 优化成 `startsWith` 蹭索引。
- 缺「主路径（DB）与降级路径（local-store）必须语义一致」的显式约束，两条路分叉时没有对照检查点。

## Promotion Candidates

> 以下交由 recorder 落地到稳定文档，本反思不修改稳定文档；route.ts 与 known-gaps 的改动已由主流程写入，recorder 复核措辞即可。

- `reference/known-gaps.md`「性能隐患」表已新增「字典搜索 contains 顺序扫描」条目（第 94 行），写明 contains 保证语义正确但走顺序扫描、当前数据量无感、升级路标为 PostgreSQL `pg_trgm` 扩展 + GIN 索引（`gin_trgm_ops`）让 contains 也走索引，并留档「提交 `d32489c` 曾误用 `startsWith` 蹭索引、已修复」。**这条历史留档面向决策者、需保留**，目的是防止后人再次「优化」成前缀匹配——与 route.ts 注释（面向读当前代码者、不提旧实现）目的不同，二者不矛盾。recorder 复核措辞即可。
- 可独立沉淀一条通用经验（供 recorder 判断是否成条）：**B-tree 索引只能加速前缀查询（`startsWith` / `LIKE 'x%'`），无法加速包含查询（`contains` / `LIKE '%x%'`）；「为蹭索引把包含搜索改成前缀搜索」是破坏正确性的反模式。** 包含搜索要走索引需上 trigram（`pg_trgm` + GIN）。
- `reference/known-gaps.md`「测试覆盖缺口」表的「无 API 路由测试」一条：现已有 `settings-maintenance` + `dictionaries-search` 两个 API 路由测试，recorder 可更新该条措辞（不再是「未测试」，而是「初步覆盖、仍不全」）。
- 可沉淀一条注释维护经验：**删改实现时，描述旧实现的代码注释要一并清理**，否则注释与代码漂移、像在影射不存在的实现；但文档里的「历史偏差留档」应保留——注释面向读当前代码者、不提旧实现，文档历史留档面向决策者、需保留教训，两者目的不同不可混淆。

## Follow-up

- recorder 按上述「提升候选」复核/更新稳定文档。
- 本次已补 `tests/api/dictionaries-search.test.ts`（8 个测试），核心断言是「生成的 Prisma `where` 永远是 `contains` 而非 `startsWith`」锁死回归，覆盖 chinese/english/auto 三种 field、缓存命中（单次 DB hit）、数据库降级 fallback、缺参 400。后续给其余 API 路由补同类契约测试。
- 字典数据增长到约 10 万行并观测到搜索变慢时，按 known-gaps 升级路标引入 `pg_trgm` + GIN 索引，而非回头改语义。
- 下次遇到「以性能为名」的改动，先确认是否存在真实性能问题、以及改动是否改变了语义（尤其 `contains`/`startsWith`、索引可加速性这类隐性语义），再决定是否动手。
