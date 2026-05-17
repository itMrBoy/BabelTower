"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  GitCompareIcon,
  CopyIcon,
  FileXIcon,
  CheckIcon,
  RefreshCwIcon,
} from "@/components/icons";
import { readCurrentTask, subscribeCurrentTask, type CurrentTask } from "@/lib/current-task";
import { useMessage } from "@/components/message-provider";

type ConflictType = "exact_zh_diff_target" | "high_similarity" | "duplicate_key" | "format_parse_error";

interface PreviewRow {
  key: string;
  keyPath: string[];
  sourceValue: string | null;
  translatedValue: string | null;
  status: string;
}

interface Snapshot {
  id: string;
  version: number;
  kind: string;
  previewRows?: PreviewRow[];
  conflictSummary?: { blocking?: number; warning?: number; info?: number; hasBlocking?: boolean };
  createdAt: string;
}

interface ApiConflictItem {
  key: string;
  keyPath: string[];
  chineseValue: string;
  existingEnglish: string;
  newEnglish: string;
  level: "blocking" | "warning" | "info";
  similarity?: number;
}

interface ConflictItemView {
  id: string;
  type: ConflictType;
  key: string;
  zhText: string;
  enText: string;
  existingEnglish?: string;
  detail?: string;
  similarity?: number;
  duplicates?: { keyPath: string; value: string }[];
}

const typeConfig: Record<
  ConflictType,
  {
    label: string;
    description: string;
    badgeClass: string;
    iconClass: string;
    rowClass: string;
    icon: React.ReactNode;
  }
> = {
  exact_zh_diff_target: {
    label: "exact_zh_diff_target",
    description: "Chinese 基准一致但 English 译文不同 — blocking",
    badgeClass: "bg-red-100 text-red-700",
    iconClass: "text-red-500",
    rowClass: "border-l-4 border-red-400 bg-red-50/40",
    icon: <AlertTriangleIcon size={20} className="text-red-500" />,
  },
  high_similarity: {
    label: "high_similarity",
    description: "Chinese 基准相似度 ≥ 90% — warning",
    badgeClass: "bg-amber-100 text-amber-700",
    iconClass: "text-amber-500",
    rowClass: "border-l-4 border-amber-400 bg-amber-50/40",
    icon: <GitCompareIcon size={20} className="text-amber-500" />,
  },
  duplicate_key: {
    label: "duplicate_key",
    description: "源文件中同一 key 被声明多次 (DUPLICATED_KEY)",
    badgeClass: "bg-indigo-100 text-indigo-700",
    iconClass: "text-indigo-500",
    rowClass: "border-l-4 border-indigo-400 bg-indigo-50/40",
    icon: <CopyIcon size={20} className="text-indigo-500" />,
  },
  format_parse_error: {
    label: "format_parse_error",
    description: "无法转成字符串的叶子值 (UNSUPPORTED_VALUE)",
    badgeClass: "bg-red-100 text-red-700",
    iconClass: "text-red-500",
    rowClass: "border-l-4 border-dashed border-red-400 bg-red-50/40",
    icon: <FileXIcon size={20} className="text-red-500" />,
  },
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export default function ConflictsPage() {
  const [currentTask, setCurrentTask] = useState<CurrentTask | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<Snapshot | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const message = useMessage();
  const [filter, setFilter] = useState<ConflictType | "all">("all");
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCurrentTask(readCurrentTask());
    return subscribeCurrentTask(setCurrentTask);
  }, []);

  const loadConflicts = useCallback(async (task: CurrentTask) => {
    setLoading(true);
        setResolvedIds(new Set());
    try {
      // 1) Get the latest snapshot for the current task.
      const historyResp = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/history`);
      const historyBody = await readJson<{ items?: Snapshot[]; error?: { message?: string } }>(historyResp);
      if (!historyResp.ok) {
        throw new Error(historyBody.error?.message ?? `History 请求失败 (HTTP ${historyResp.status})`);
      }
      const latest = historyBody.items?.[0] ?? null;
      setLatestSnapshot(latest);
      if (!latest) {
        setConflicts([]);
        return;
      }

      // 2) Pull duplicate_key / format_parse_error directly from the snapshot's preview rows.
      const previewRows = latest.previewRows ?? [];
      const duplicateRows = previewRows.filter((row) => row.status === "DUPLICATED_KEY");
      const unsupportedRows = previewRows.filter((row) => row.status === "UNSUPPORTED_VALUE");

      const duplicateGroups = new Map<string, { keyPath: string; value: string }[]>();
      for (const row of duplicateRows) {
        const key = row.sourceValue ?? row.key;
        const list = duplicateGroups.get(key) ?? [];
        list.push({ keyPath: row.keyPath.join("."), value: row.sourceValue ?? "" });
        duplicateGroups.set(key, list);
      }

      const duplicateConflicts: ConflictItemView[] = Array.from(duplicateGroups.entries()).map(
        ([key, occurrences], index) => ({
          id: `dup-${index}-${key}`,
          type: "duplicate_key",
          key,
          zhText: occurrences[0]?.value ?? "",
          enText: "",
          duplicates: occurrences,
          detail: `源文件中 key/值出现 ${occurrences.length} 次：${occurrences
            .map((entry) => entry.keyPath)
            .join(" / ")}`,
        }),
      );

      const parseConflicts: ConflictItemView[] = unsupportedRows.map((row, index) => ({
        id: `parse-${index}-${row.key}`,
        type: "format_parse_error",
        key: row.key,
        zhText: row.sourceValue ?? "",
        enText: row.translatedValue ?? "",
        detail: "解析后的叶子值不是合法字符串 (UNSUPPORTED_VALUE)，需要在源文件修正后重新导入。",
      }));

      // 3) Ask /api/dictionaries/conflicts for exact / similar dictionary conflicts.
      const entries = previewRows
        .filter((row) => row.sourceValue && row.sourceValue.trim().length > 0)
        .map((row) => ({
          key: row.key,
          keyPath: row.keyPath,
          sourceValue: row.sourceValue,
          translatedValue: row.translatedValue,
          locale: "en-US",
          status: "NORMAL" as const,
        }));

      let blockingList: ApiConflictItem[] = [];
      let warningList: ApiConflictItem[] = [];
      if (entries.length > 0) {
        const conflictResp = await fetch("/api/dictionaries/conflicts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        });
        const conflictBody = await readJson<{
          conflictSummary?: { blocking?: ApiConflictItem[]; warning?: ApiConflictItem[] };
          error?: { message?: string };
        }>(conflictResp);
        if (!conflictResp.ok) {
          throw new Error(conflictBody.error?.message ?? `Conflicts 请求失败 (HTTP ${conflictResp.status})`);
        }
        blockingList = conflictBody.conflictSummary?.blocking ?? [];
        warningList = conflictBody.conflictSummary?.warning ?? [];
      }

      const blockingConflicts: ConflictItemView[] = blockingList.map((item, index) => ({
        id: `blocking-${index}-${item.key}`,
        type: "exact_zh_diff_target",
        key: item.key,
        zhText: item.chineseValue,
        enText: item.newEnglish,
        existingEnglish: item.existingEnglish,
        detail: `字典中已有 “${item.existingEnglish || "—"}”，本次导入想写入 “${item.newEnglish || "—"}”。`,
      }));

      const warningConflicts: ConflictItemView[] = warningList.map((item, index) => ({
        id: `warning-${index}-${item.key}`,
        type: "high_similarity",
        key: item.key,
        zhText: item.chineseValue,
        enText: item.newEnglish,
        existingEnglish: item.existingEnglish,
        similarity: item.similarity ? Math.round(item.similarity * 100) : undefined,
        detail: `与字典基准 (英文：${item.existingEnglish || "—"}) 高度相似，请确认是否复用。`,
      }));

      setConflicts([
        ...blockingConflicts,
        ...warningConflicts,
        ...duplicateConflicts,
        ...parseConflicts,
      ]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
      setConflicts([]);
      setLatestSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentTask) {
      setConflicts([]);
      setLatestSnapshot(null);
      return;
    }
    void loadConflicts(currentTask);
  }, [currentTask, loadConflicts]);

  const filtered = useMemo(
    () => (filter === "all" ? conflicts : conflicts.filter((c) => c.type === filter)),
    [filter, conflicts],
  );

  const counts = useMemo(
    () => ({
      total: conflicts.length,
      exact_zh_diff_target: conflicts.filter((c) => c.type === "exact_zh_diff_target").length,
      high_similarity: conflicts.filter((c) => c.type === "high_similarity").length,
      duplicate_key: conflicts.filter((c) => c.type === "duplicate_key").length,
      format_parse_error: conflicts.filter((c) => c.type === "format_parse_error").length,
    }),
    [conflicts],
  );

  const resolveOne = (id: string) => {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const resolveAll = () => {
    setResolvedIds(new Set(conflicts.map((c) => c.id)));
  };

  if (!currentTask) {
    return (
      <div className="p-6">
        <div className="max-w-3xl mx-auto bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
          <AlertTriangleIcon size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800">尚未选择任务，无法显示冲突</p>
            <p className="text-sm text-amber-700">
              请先回到 <Link href="/" className="font-medium underline">首页</Link> 上传或选择一个任务，再回到本页查看真实的冲突列表。
            </p>
            <p className="text-xs text-amber-600 mt-2">
              冲突列表只在当前任务的最新 TaskSnapshot 上计算 (来自 <code className="font-mono">/api/tasks/&#123;id&#125;/history</code> 与 <code className="font-mono">/api/dictionaries/conflicts</code>)。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Current task banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wider">当前任务</p>
            <p className="text-sm font-semibold text-slate-800 break-all">{currentTask.name}</p>
            <p className="text-xs text-slate-500">
              ID: <span className="font-mono">{currentTask.id}</span> · 状态: {currentTask.status} · v
              {latestSnapshot?.version ?? currentTask.latestVersion}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadConflicts(currentTask)}
              className="text-xs text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0"
              disabled={loading}
            >
              <RefreshCwIcon size={12} /> {loading ? "刷新中" : "刷新"}
            </button>
            <Link
              href="/snapshots"
              className="text-xs text-brand-600 hover:underline"
            >
              切换其他任务 →
            </Link>
          </div>
        </div>


        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">总冲突数</p>
            <p className="text-2xl font-bold text-slate-800">{counts.total}</p>
          </div>
          <div className="bg-red-50 rounded-lg border border-red-200 p-4">
            <p className="text-xs text-red-600 mb-1">exact_zh_diff_target</p>
            <p className="text-2xl font-bold text-red-700">{counts.exact_zh_diff_target}</p>
          </div>
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
            <p className="text-xs text-amber-600 mb-1">high_similarity</p>
            <p className="text-2xl font-bold text-amber-700">{counts.high_similarity}</p>
          </div>
          <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-4">
            <p className="text-xs text-indigo-600 mb-1">duplicate_key</p>
            <p className="text-2xl font-bold text-indigo-700">{counts.duplicate_key}</p>
          </div>
          <div className="bg-red-50 rounded-lg border border-red-200 p-4">
            <p className="text-xs text-red-600 mb-1">format_parse_error</p>
            <p className="text-2xl font-bold text-red-700">{counts.format_parse_error}</p>
          </div>
        </div>

        {/* Filter & Actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
              value={filter}
              onChange={(event) => setFilter(event.target.value as ConflictType | "all")}
            >
              <option value="all">全部类型</option>
              <option value="exact_zh_diff_target">exact_zh_diff_target</option>
              <option value="high_similarity">high_similarity</option>
              <option value="duplicate_key">duplicate_key</option>
              <option value="format_parse_error">format_parse_error</option>
            </select>
            <span className="text-xs text-slate-500">
              显示 {filtered.filter((c) => !resolvedIds.has(c.id)).length} / {filtered.length} 条未解决
            </span>
          </div>
          <button
            type="button"
            className="text-sm bg-brand-500 text-white px-4 py-2 rounded-md font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
            onClick={resolveAll}
            disabled={conflicts.length === 0}
          >
            全部标记为已确认
          </button>
        </div>

        {/* Conflict List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-semibold text-sm text-slate-700">冲突列表</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              数据源：<code className="font-mono">/api/tasks/&#123;id&#125;/history</code> + <code className="font-mono">/api/dictionaries/conflicts</code>
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">正在从最新快照计算冲突...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <CheckIcon size={32} className="mx-auto mb-3 text-green-500" />
              <p className="text-sm">
                {conflicts.length === 0 ? "当前任务的最新快照暂无冲突。" : "该筛选条件下没有冲突。"}
              </p>
            </div>
          ) : (
            filtered.map((conflict) => {
              const cfg = typeConfig[conflict.type];
              const resolved = resolvedIds.has(conflict.id);
              if (resolved) {
                return (
                  <div key={conflict.id} className="p-4 border-t border-slate-100 opacity-60">
                    <div className="flex items-center gap-3">
                      <CheckIcon size={18} className="text-green-500" />
                      <span className="font-mono text-sm text-slate-700 line-through break-all">
                        {conflict.key}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">已标记</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={conflict.id} className={`p-4 border-t border-slate-100 ${cfg.rowClass}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">{cfg.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-mono text-sm font-medium text-slate-800 break-all">{conflict.key}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-slate-500 ml-auto">{cfg.description}</span>
                      </div>

                      {conflict.type === "exact_zh_diff_target" && (
                        <div className="grid md:grid-cols-2 gap-3 text-sm">
                          <div className="bg-white border border-slate-200 rounded-md p-3">
                            <p className="text-xs text-slate-500 mb-1">中文基准 (zh-CN)</p>
                            <p className="text-slate-800 break-all">{conflict.zhText || "—"}</p>
                          </div>
                          <div className="bg-white border border-red-200 rounded-md p-3 space-y-1.5">
                            <div>
                              <p className="text-xs text-slate-500 mb-1">字典已有英文</p>
                              <p className="text-slate-700 break-all">{conflict.existingEnglish || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-red-500 mb-1">本次导入英文 — 与字典不同</p>
                              <p className="text-red-700 font-medium break-all">{conflict.enText || "—"}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {conflict.type === "high_similarity" && (
                        <>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div className="bg-white border border-slate-200 rounded-md p-3">
                              <p className="text-xs text-slate-500 mb-1">中文基准 (zh-CN)</p>
                              <p className="text-slate-800 break-all">{conflict.zhText || "—"}</p>
                            </div>
                            <div className="bg-white border border-amber-200 rounded-md p-3">
                              <p className="text-xs text-amber-600 mb-1">
                                本次英文 (相似度{conflict.similarity != null ? ` ${conflict.similarity}%` : ""})
                              </p>
                              <p className="text-amber-800 font-medium break-all">{conflict.enText || "—"}</p>
                            </div>
                          </div>
                          {conflict.detail && (
                            <div className="mt-2 bg-amber-50 border border-amber-100 rounded-md p-2 text-xs text-amber-700">
                              <span className="font-medium">提示：</span>
                              {conflict.detail}
                            </div>
                          )}
                        </>
                      )}

                      {conflict.type === "duplicate_key" && (
                        <>
                          <p className="text-sm text-slate-600 mb-2">
                            同一 key 在源文件中出现 {conflict.duplicates?.length ?? 0} 次：
                          </p>
                          <div className="space-y-1.5 mb-3">
                            {conflict.duplicates?.map((occurrence, idx) => (
                              <div
                                key={`${occurrence.keyPath}-${idx}`}
                                className="bg-white border border-slate-200 rounded-md p-2 text-sm flex items-center gap-3"
                              >
                                <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                                  #{idx + 1}
                                </span>
                                <span className="text-slate-700 font-mono text-xs">{occurrence.keyPath}</span>
                                <span className="text-slate-500 text-xs">= {occurrence.value}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {conflict.type === "format_parse_error" && (
                        <>
                          <div className="bg-white border border-red-200 rounded-md p-3 text-sm mb-2 space-y-1.5">
                            <div>
                              <p className="text-xs text-red-500">无法解析的叶子值</p>
                              <p className="text-red-700 font-medium break-all">{conflict.detail}</p>
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-md p-2 font-mono text-xs text-slate-600 break-all">
                            key: {conflict.key}
                          </div>
                        </>
                      )}

                      <div className="flex gap-2 mt-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => resolveOne(conflict.id)}
                          className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-md font-medium hover:bg-green-600 transition-colors ml-auto inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                        >
                          <CheckIcon size={12} /> 标记已确认
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-slate-400 text-center">
          说明：本页只展示「确认/查看」操作，blocking 冲突的实际解决方案 (KEEP_EXISTING / UPDATE_DICTIONARY) 仍需在首页保存流程中下发到后端。
        </p>
      </div>
    </div>
  );
}
