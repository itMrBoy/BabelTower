"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  GitCompareIcon,
  CopyIcon,
  FileXIcon,
  CheckIcon,
  RefreshCwIcon,
} from "@/components/icons";
import { readCurrentTask, subscribeCurrentTask, writeCurrentTask, type CurrentTask } from "@/lib/current-task";
import { apiFetch } from "@/lib/http-client";
import { useMessage } from "@/components/message-provider";

type ConflictType = "exact_zh_diff_target" | "high_similarity" | "duplicate_key" | "format_parse_error";
type ConflictResolutionAction = "KEEP_EXISTING" | "UPDATE_DICTIONARY" | "IGNORE_SIMILAR" | "EDIT_ROW";

interface PreviewRow {
  key: string;
  keyPath: string[];
  sourceValue: string | null;
  translatedValue: string | null;
  status: string;
  conflictLevel?: "blocking" | "warning" | "info";
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
  id: string;
  key: string;
  keyPath: string[];
  chineseValue: string;
  existingEnglish: string;
  newEnglish: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  type: "DUPLICATE_IDENTICAL" | "EXACT_CHINESE_DIFF_ENGLISH" | "SIMILAR_CHINESE";
  similarity?: number | null;
  reason?: string;
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

interface ResolutionDraft {
  useDictionaryValue: boolean;
  finalValue: string;
}

interface StoredResolution {
  key: string;
  type: ConflictType;
  finalValue: string;
  resolution: ConflictResolutionAction;
  resolvedAt: string;
}

const resolutionStore: Record<string, Record<string, StoredResolution>> = {};

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
    label: "同中文不同英文",
    description: "中文基准一致但英文译文不同 - 阻断",
    badgeClass: "bg-red-100 text-red-700",
    iconClass: "text-red-500",
    rowClass: "border-l-4 border-red-400 bg-red-50/40",
    icon: <AlertTriangleIcon size={20} className="text-red-500" />,
  },
  high_similarity: {
    label: "高相似度",
    description: "中文基准相似度 >= 90% - 警告",
    badgeClass: "bg-amber-100 text-amber-700",
    iconClass: "text-amber-500",
    rowClass: "border-l-4 border-amber-400 bg-amber-50/40",
    icon: <GitCompareIcon size={20} className="text-amber-500" />,
  },
  duplicate_key: {
    label: "重复 Key",
    description: "源文件中同一 key 被声明多次",
    badgeClass: "bg-indigo-100 text-indigo-700",
    iconClass: "text-indigo-500",
    rowClass: "border-l-4 border-indigo-400 bg-indigo-50/40",
    icon: <CopyIcon size={20} className="text-indigo-500" />,
  },
  format_parse_error: {
    label: "格式解析错误",
    description: "无法转成字符串的叶子值",
    badgeClass: "bg-red-100 text-red-700",
    iconClass: "text-red-500",
    rowClass: "border-l-4 border-dashed border-red-400 bg-red-50/40",
    icon: <FileXIcon size={20} className="text-red-500" />,
  },
};

function isValueConflict(conflict: ConflictItemView) {
  return conflict.type === "exact_zh_diff_target" || conflict.type === "high_similarity";
}

function createDefaultDraft(conflict: ConflictItemView): ResolutionDraft {
  return {
    useDictionaryValue: false,
    finalValue: conflict.enText || conflict.existingEnglish || "",
  };
}

function conflictStorageKey(conflict: ConflictItemView) {
  return `${conflict.type}:${conflict.key}:${conflict.zhText}`;
}

function readResolutionStore(): Record<string, Record<string, StoredResolution>> {
  return resolutionStore;
}

function readResolvedConflictKeys(taskId: string) {
  return new Set(Object.keys(readResolutionStore()[taskId] ?? {}));
}

function writeStoredResolutions(
  taskId: string,
  resolutions: { conflict: ConflictItemView; finalValue: string; resolution: ConflictResolutionAction }[],
) {
  const store = readResolutionStore();
  const taskStore = { ...(store[taskId] ?? {}) };
  for (const item of resolutions) {
    taskStore[conflictStorageKey(item.conflict)] = {
      key: item.conflict.key,
      type: item.conflict.type,
      finalValue: item.finalValue,
      resolution: item.resolution,
      resolvedAt: new Date().toISOString(),
    };
  }
  resolutionStore[taskId] = taskStore;
}

function buildInitialDrafts(conflicts: ConflictItemView[]) {
  return conflicts.reduce<Record<string, ResolutionDraft>>((acc, conflict) => {
    if (isValueConflict(conflict)) acc[conflict.id] = createDefaultDraft(conflict);
    return acc;
  }, {});
}

function viewTypeFromApi(item: ApiConflictItem): ConflictType {
  if (item.type === "EXACT_CHINESE_DIFF_ENGLISH" || item.severity === "BLOCKING") return "exact_zh_diff_target";
  if (item.type === "SIMILAR_CHINESE" || item.severity === "WARNING") return "high_similarity";
  return "duplicate_key";
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(input, init);
  const body = await readJson<T & { error?: { message?: string }; message?: string }>(response);
  if (!response.ok) {
    throw new Error(body.error?.message ?? body.message ?? `Request failed with status ${response.status}`);
  }
  return body as T;
}

function syncWorkspacePreviewState(task: CurrentTask, snapshot: Snapshot) {
  writeCurrentTask({ ...task, latestVersion: snapshot.version });
}

function rowWithResolvedValue(row: PreviewRow, finalValue: string): PreviewRow {
  return { ...row, translatedValue: finalValue, conflictLevel: undefined };
}

function applyResolvedValue(rows: PreviewRow[], conflict: ConflictItemView, finalValue: string) {
  let matched = false;
  const nextRows = rows.map((row) => {
    const sameKey = row.key === conflict.key;
    const sameChinese = (row.sourceValue ?? "") === (conflict.zhText ?? "");
    if (sameKey && sameChinese) {
      matched = true;
      return rowWithResolvedValue(row, finalValue);
    }
    return row;
  });

  if (matched) return nextRows;
  return rows.map((row) => (row.key === conflict.key ? rowWithResolvedValue(row, finalValue) : row));
}

function resolutionFromDraft(
  conflict: ConflictItemView,
  draft: ResolutionDraft,
  finalValue: string,
): ConflictResolutionAction {
  const dictionaryValue = (conflict.existingEnglish ?? "").trim();
  const currentValue = (conflict.enText ?? "").trim();

  if (draft.useDictionaryValue && dictionaryValue && finalValue === dictionaryValue) return "KEEP_EXISTING";
  if (conflict.type === "exact_zh_diff_target" && finalValue === currentValue) return "UPDATE_DICTIONARY";
  if (conflict.type === "high_similarity" && finalValue === currentValue) return "IGNORE_SIMILAR";
  if (dictionaryValue && finalValue === dictionaryValue) return "KEEP_EXISTING";
  return "EDIT_ROW";
}

export default function ConflictsPage() {
  const [currentTask, setCurrentTask] = useState<CurrentTask | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<Snapshot | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const message = useMessage();
  const [filter, setFilter] = useState<ConflictType | "all">("all");
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, ResolutionDraft>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCurrentTask(readCurrentTask());
    return subscribeCurrentTask(setCurrentTask);
  }, []);

  const loadConflicts = useCallback(async (task: CurrentTask) => {
    setLoading(true);
    try {
      // 1) Get the latest snapshot for the current task.
      const historyResp = await apiFetch(`/api/tasks/${encodeURIComponent(task.id)}/history?latestOnly=true&includeRows=true`);
      const historyBody = await readJson<{ items?: Snapshot[]; error?: { message?: string } }>(historyResp);
      if (!historyResp.ok) {
        throw new Error(historyBody.error?.message ?? `History 请求失败 (HTTP ${historyResp.status})`);
      }
      const latest = historyBody.items?.[0] ?? null;
      setLatestSnapshot(latest);
      if (!latest) {
        setConflicts([]);
        setResolutionDrafts({});
        setResolvedIds(new Set());
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

      const conflictResp = await apiFetch(`/api/tasks/${encodeURIComponent(task.id)}/conflicts?unresolvedOnly=true`);
      const conflictBody = await readJson<{
        items?: ApiConflictItem[];
        error?: { message?: string };
      }>(conflictResp);
      if (!conflictResp.ok) {
        throw new Error(conflictBody.error?.message ?? `任务冲突请求失败 (HTTP ${conflictResp.status})`);
      }

      const taskConflicts: ConflictItemView[] = (conflictBody.items ?? [])
        .filter((item) => item.severity !== "INFO")
        .map((item) => {
          const type = viewTypeFromApi(item);
          return {
            id: item.id,
            type,
            key: item.key,
            zhText: item.chineseValue,
            enText: item.newEnglish,
            existingEnglish: item.existingEnglish,
            similarity: item.similarity ? Math.round(item.similarity * 100) : undefined,
            detail:
              type === "exact_zh_diff_target"
                ? `字典中已有 “${item.existingEnglish || "—"}”，本次导入想写入 “${item.newEnglish || "—"}”。`
                : `与字典基准 (英文：${item.existingEnglish || "—"}) 高度相似，请确认是否复用。`,
          };
        });

      const nextConflicts = [
        ...taskConflicts,
        ...duplicateConflicts,
        ...parseConflicts,
      ];

      setConflicts(nextConflicts);
      setResolutionDrafts(buildInitialDrafts(nextConflicts));
      const resolvedKeys = readResolvedConflictKeys(task.id);
      setResolvedIds(
        new Set(
          nextConflicts
            .filter((conflict) => resolvedKeys.has(conflictStorageKey(conflict)))
            .map((conflict) => conflict.id),
        ),
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
      setConflicts([]);
      setResolutionDrafts({});
      setResolvedIds(new Set());
      setLatestSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (!currentTask) {
      setConflicts([]);
      setResolutionDrafts({});
      setResolvedIds(new Set());
      setLatestSnapshot(null);
      return;
    }
    void loadConflicts(currentTask);
  }, [currentTask, loadConflicts]);

  const filtered = useMemo(
    () => (filter === "all" ? conflicts : conflicts.filter((c) => c.type === filter)),
    [filter, conflicts],
  );

  const virtualEstimateHeight = 360;
  const virtualViewportHeight = 720;
  const virtualOverscan = 4;

  const virtualOffsets = useMemo(() => {
    const offsets: number[] = [];
    let total = 0;
    for (const conflict of filtered) {
      offsets.push(total);
      total += measuredHeights[conflict.id] ?? virtualEstimateHeight;
    }
    return { offsets, total };
  }, [filtered, measuredHeights]);

  const measuredBottom = listScrollTop + virtualViewportHeight;
  let calculatedStart = 0;
  while (
    calculatedStart < filtered.length &&
    virtualOffsets.offsets[calculatedStart] + (measuredHeights[filtered[calculatedStart].id] ?? virtualEstimateHeight) < listScrollTop
  ) {
    calculatedStart += 1;
  }

  let calculatedEnd = calculatedStart;
  while (calculatedEnd < filtered.length && virtualOffsets.offsets[calculatedEnd] < measuredBottom) {
    calculatedEnd += 1;
  }

  const virtualStart = Math.max(0, calculatedStart - virtualOverscan);
  const virtualEnd = Math.min(filtered.length, calculatedEnd + virtualOverscan);
  const virtualItems = filtered.slice(virtualStart, virtualEnd);
  const totalVirtualHeight = virtualOffsets.total;

  useEffect(() => {
    setListScrollTop(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [filter]);

  useEffect(() => {
    setMeasuredHeights({});
  }, [currentTask?.id, filter]);

  function measureConflictItem(id: string, node: HTMLDivElement | null) {
    if (!node) return;
    const height = Math.ceil(node.getBoundingClientRect().height);
    setMeasuredHeights((current) => {
      if (Math.abs((current[id] ?? 0) - height) <= 2) return current;
      return { ...current, [id]: height };
    });
  }

  function handleListWheel(event: React.WheelEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const atTop = target.scrollTop <= 0;
    const atBottom = Math.ceil(target.scrollTop + target.clientHeight) >= target.scrollHeight;
    const scrollingPastTop = event.deltaY < 0 && atTop;
    const scrollingPastBottom = event.deltaY > 0 && atBottom;

    if (scrollingPastTop || scrollingPastBottom) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

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

  const unresolvedFilteredCount = filtered.filter((conflict) => !resolvedIds.has(conflict.id)).length;

  function updateResolutionDraft(conflict: ConflictItemView, patch: Partial<ResolutionDraft>) {
    setResolutionDrafts((current) => ({
      ...current,
      [conflict.id]: {
        ...createDefaultDraft(conflict),
        ...current[conflict.id],
        ...patch,
      },
    }));
  }

  async function resolveConflicts(targets: ConflictItemView[]) {
    if (!currentTask || !latestSnapshot) return;
    const actionable = targets.filter((conflict) => !resolvedIds.has(conflict.id));
    if (actionable.length === 0) {
      message.info("选中的冲突已经同步过。");
      return;
    }

    const baseRows = latestSnapshot.previewRows ?? [];
    if (!Array.isArray(baseRows)) {
      message.error("最新快照缺少预览行，无法同步冲突处理结果。");
      return;
    }

    let nextRows = baseRows;
    const resolvedPayload: { key: string; resolution: ConflictResolutionAction }[] = [];
    const storedResolutions: { conflict: ConflictItemView; finalValue: string; resolution: ConflictResolutionAction }[] = [];

    for (const conflict of actionable) {
      let finalValue = conflict.enText ?? "";
      let resolution: ConflictResolutionAction = "EDIT_ROW";

      if (isValueConflict(conflict)) {
        const draft = resolutionDrafts[conflict.id] ?? createDefaultDraft(conflict);
        finalValue = draft.finalValue.trim();
        if (!finalValue) {
          message.error(`请先为 ${conflict.key} 填写最终英文值。`);
          return;
        }
        resolution = resolutionFromDraft(conflict, draft, finalValue);
        nextRows = applyResolvedValue(nextRows, conflict, finalValue);
      }

      resolvedPayload.push({ key: conflict.key, resolution });
      storedResolutions.push({ conflict, finalValue, resolution });
    }

    setResolvingId(actionable.length > 1 ? "__all__" : actionable[0]?.id ?? "__batch__");
    try {
      const changedRows = nextRows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row }, rowIndex) => row !== baseRows[rowIndex])
        .map(({ row, rowIndex }) => ({
          key: row.key,
          rowKey: row.key,
          rowIndex,
          keyPath: row.keyPath,
          sourceValue: row.sourceValue,
          translatedValue: row.translatedValue,
          status: row.status,
          conflictLevel: row.conflictLevel,
        }));
      const response = await requestJson<{ currentVersion: number; conflictSummary?: Snapshot["conflictSummary"] }>(`/api/tasks/${encodeURIComponent(currentTask.id)}/rows`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersion: latestSnapshot.version,
          rows: changedRows,
          resolvedConflicts: resolvedPayload,
        }),
      });

      const nextSnapshot: Snapshot = {
        ...latestSnapshot,
        previewRows: nextRows,
        conflictSummary: response.conflictSummary ?? latestSnapshot.conflictSummary,
      };
      const nextTask = { ...currentTask, latestVersion: nextSnapshot.version };
      setLatestSnapshot(nextSnapshot);
      setCurrentTask(nextTask);
      writeCurrentTask(nextTask);
      syncWorkspacePreviewState(nextTask, nextSnapshot);
      writeStoredResolutions(currentTask.id, storedResolutions);
      setResolvedIds((prev) => {
        const next = new Set(prev);
        for (const conflict of actionable) next.add(conflict.id);
        return next;
      });
      setConflicts((current) =>
        current.map((conflict) => {
          const stored = storedResolutions.find((item) => item.conflict.id === conflict.id);
          if (!stored || !isValueConflict(conflict)) return conflict;
          return { ...conflict, enText: stored.finalValue };
        }),
      );
      message.success(`已同步 ${storedResolutions.length} 个冲突处理结果到暂存表，当前版本 v${nextSnapshot.version}。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setResolvingId(null);
    }
  }

  const resolveOne = (conflict: ConflictItemView) => {
    void resolveConflicts([conflict]);
  };

  const resolveAll = () => {
    void resolveConflicts(conflicts.filter((conflict) => !resolvedIds.has(conflict.id)));
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
              冲突列表来自当前任务未解决的冲突记录，并与首页导入时的冲突摘要保持同一口径。
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
              disabled={loading || resolvingId !== null}
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
            <p className="text-xs text-red-600 mb-1">{typeConfig.exact_zh_diff_target.label}</p>
            <p className="text-2xl font-bold text-red-700">{counts.exact_zh_diff_target}</p>
          </div>
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
            <p className="text-xs text-amber-600 mb-1">{typeConfig.high_similarity.label}</p>
            <p className="text-2xl font-bold text-amber-700">{counts.high_similarity}</p>
          </div>
          <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-4">
            <p className="text-xs text-indigo-600 mb-1">{typeConfig.duplicate_key.label}</p>
            <p className="text-2xl font-bold text-indigo-700">{counts.duplicate_key}</p>
          </div>
          <div className="bg-red-50 rounded-lg border border-red-200 p-4">
            <p className="text-xs text-red-600 mb-1">{typeConfig.format_parse_error.label}</p>
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
              <option value="exact_zh_diff_target">{typeConfig.exact_zh_diff_target.label}</option>
              <option value="high_similarity">{typeConfig.high_similarity.label}</option>
              <option value="duplicate_key">{typeConfig.duplicate_key.label}</option>
              <option value="format_parse_error">{typeConfig.format_parse_error.label}</option>
            </select>
            <span className="text-xs text-slate-500">
              显示 {unresolvedFilteredCount} / {filtered.length} 条待处理
            </span>
          </div>
          <button
            type="button"
            className="text-sm bg-brand-500 text-white px-4 py-2 rounded-md font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
            onClick={resolveAll}
            disabled={conflicts.length === 0 || conflicts.every((conflict) => resolvedIds.has(conflict.id)) || resolvingId !== null}
          >
            {resolvingId === "__all__" ? "同步中..." : "全部同步并标记"}
          </button>
        </div>

        {/* Conflict List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-semibold text-sm text-slate-700">冲突列表</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              先选择采用当前值、字典值或手工最终值；标记解决会创建新的 TaskSnapshot 并同步回首页预览表。
            </p>
            {filtered.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                展示 {virtualStart + 1}-{virtualEnd} / {filtered.length} 条
              </p>
            )}
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
            <div
              ref={listRef}
              className="max-h-[720px] overflow-y-auto overscroll-contain"
              onWheel={handleListWheel}
              onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}
            >
              <div className="relative" style={{ height: totalVirtualHeight }}>
                {virtualItems.map((conflict) => {
              const cfg = typeConfig[conflict.type];
              const resolved = resolvedIds.has(conflict.id);
              const draft = resolutionDrafts[conflict.id] ?? createDefaultDraft(conflict);
              const isResolving = resolvingId === conflict.id || resolvingId === "__all__";
              const itemTop = virtualOffsets.offsets[virtualStart + virtualItems.indexOf(conflict)] ?? 0;
              if (resolved) {
                return (
                  <div
                    key={conflict.id}
                    ref={(node) => measureConflictItem(conflict.id, node)}
                    className="absolute left-0 right-0"
                    style={{ top: itemTop }}
                  >
                    <div className="p-4 border-t border-slate-100 opacity-70">
                      <div className="flex items-center gap-3">
                        <CheckIcon size={18} className="text-green-500" />
                        <span className="font-mono text-sm text-slate-700 line-through break-all">
                          {conflict.key}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">已同步</span>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={conflict.id}
                  ref={(node) => measureConflictItem(conflict.id, node)}
                  className={`absolute left-0 right-0 p-4 border-t border-slate-100 ${cfg.rowClass}`}
                  style={{ top: itemTop }}
                >
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

                      {isValueConflict(conflict) && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white/90 p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                checked={draft.useDictionaryValue}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  updateResolutionDraft(conflict, {
                                    useDictionaryValue: checked,
                                    finalValue: checked ? conflict.existingEnglish ?? "" : conflict.enText ?? "",
                                  });
                                }}
                              />
                              采用字典值
                            </label>
                            <span className="text-xs text-slate-500">
                              未勾选时默认沿用当前导入值，也可以直接编辑最终值。
                            </span>
                          </div>
                          <label className="block text-xs font-medium text-slate-600 space-y-1.5">
                            <span>最终确定的英文值</span>
                            <textarea
                              value={draft.finalValue}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                updateResolutionDraft(conflict, {
                                  finalValue: nextValue,
                                  useDictionaryValue:
                                    nextValue.trim() === (conflict.existingEnglish ?? "").trim() &&
                                    (conflict.existingEnglish ?? "").trim().length > 0,
                                });
                              }}
                              className="w-full min-h-[72px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                              placeholder="输入最终确认后要同步到预览页的英文"
                            />
                          </label>
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <button
                              type="button"
                              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-slate-600 hover:bg-white"
                              onClick={() => updateResolutionDraft(conflict, { useDictionaryValue: false, finalValue: conflict.enText ?? "" })}
                            >
                              使用当前值：<span className="font-medium text-slate-800 break-all">{conflict.enText || "—"}</span>
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-slate-600 hover:bg-white"
                              onClick={() => updateResolutionDraft(conflict, { useDictionaryValue: true, finalValue: conflict.existingEnglish ?? "" })}
                            >
                              使用字典值：<span className="font-medium text-slate-800 break-all">{conflict.existingEnglish || "—"}</span>
                            </button>
                          </div>
                        </div>
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
                          onClick={() => resolveOne(conflict)}
                          disabled={resolvingId !== null}
                          className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-md font-medium hover:bg-green-600 transition-colors disabled:opacity-50 ml-auto inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                        >
                          <CheckIcon size={12} /> {isResolving ? "同步中..." : isValueConflict(conflict) ? "同步并标记解决" : "标记已确认"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
              })}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center">
          说明：blocking 冲突会按最终英文值更新预览行，并同步冲突解决状态；返回首页后即可继续校验、保存或导出。
        </p>
      </div>
    </div>
  );
}
