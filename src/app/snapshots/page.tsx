"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  CheckIcon,
  FileXIcon,
  RefreshCwIcon,
} from "@/components/icons";
import { readCurrentTask, subscribeCurrentTask, writeCurrentTask } from "@/lib/current-task";
import { useMessage } from "@/components/message-provider";

interface Task {
  id: string;
  projectId: string;
  project?: {
    id: string;
    name: string;
  } | null;
  name: string;
  status: string;
  mode: string;
  format: string;
  latestVersion: number;
  sourceFilename: string | null;
  targetFilename: string | null;
  sourceLocale: string;
  targetLocale: string;
  dictionarySyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SnapshotSummaryCounts {
  blocking?: number;
  warning?: number;
  info?: number;
  hasBlocking?: boolean;
}

interface Snapshot {
  id: string;
  taskId: string;
  version: number;
  kind: string;
  conflictSummary?: SnapshotSummaryCounts | null;
  createdAt: string;
}

function statusBadge(status: string) {
  const map: Record<string, { className: string; label: string }> = {
    DRAFT: { className: "bg-amber-100 text-amber-700", label: "草稿" },
    SAVED: { className: "bg-green-100 text-green-700", label: "已保存" },
    READ_ONLY_HISTORY: { className: "bg-slate-100 text-slate-600", label: "只读历史" },
    CANCELLED: { className: "bg-red-100 text-red-700", label: "已取消" },
  };
  const config = map[status] ?? { className: "bg-slate-100 text-slate-600", label: status };
  return (
    <span className={`text-xs ${config.className} px-2 py-0.5 rounded-full font-medium`}>
      {config.label}
    </span>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: "草稿",
    SAVED: "已保存",
    READ_ONLY_HISTORY: "只读历史",
    CANCELLED: "已取消",
  };
  return map[status] ?? status;
}

function dictionarySyncBadge(syncedAt?: string | null) {
  return syncedAt ? (
    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">已同步</span>
  ) : (
    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">未同步</span>
  );
}

function snapshotKindLabel(kind: string) {
  switch (kind) {
    case "IMPORTED":
      return "导入";
    case "MANUAL_DRAFT":
      return "手动暂存";
    case "AUTO_DRAFT":
      return "自动暂存";
    case "SAVED":
      return "已保存";
    case "EXPORTED":
      return "已导出";
    default:
      return kind;
  }
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export default function SnapshotsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const message = useMessage();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
        try {
      const response = await fetch("/api/tasks");
      const body = await readJson<{ items?: Task[]; error?: { message?: string } }>(response);
      if (!response.ok) {
        throw new Error(body.error?.message ?? `请求失败 (HTTP ${response.status})`);
      }
      setTasks(body.items ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const loadHistory = useCallback(async (taskId: string) => {
    setLoadingHistory(true);
        try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/history?limit=50`);
      const body = await readJson<{ items?: Snapshot[]; error?: { message?: string } }>(response);
      if (!response.ok) {
        throw new Error(body.error?.message ?? `请求失败 (HTTP ${response.status})`);
      }
      setHistory(body.items ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const current = readCurrentTask();
    if (current?.id) setSelectedTaskId(current.id);
    return subscribeCurrentTask((task) => {
      if (task?.id) setSelectedTaskId(task.id);
    });
  }, []);

  useEffect(() => {
    if (!selectedTaskId) {
      setHistory([]);
      return;
    }
    void loadHistory(selectedTaskId);
  }, [selectedTaskId, loadHistory]);

  const filtered = statusFilter === "all" ? tasks : tasks.filter((task) => task.status === statusFilter);
  const selected = filtered.find((task) => task.id === selectedTaskId) ?? null;
  const statusOptions = Array.from(new Set(tasks.map((task) => task.status)));
  const latestSnapshot = history[0] ?? null;
  const latestConflicts = latestSnapshot?.conflictSummary ?? null;

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Task Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-sm text-slate-700">翻译任务历史</h3>
            <div className="flex items-center gap-2">
              <select
                className="text-xs border border-slate-200 rounded-md px-2 h-8 bg-white text-slate-600 outline-none"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">全部状态</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadTasks()}
                className="text-xs text-slate-600 border border-slate-200 rounded-md px-2 h-8 hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                disabled={loadingTasks}
              >
                <RefreshCwIcon size={12} /> {loadingTasks ? "加载中" : "刷新"}
              </button>
            </div>
          </div>


          <div className="overflow-auto">
            <table className="w-full text-sm snapshots-nowrap-table">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">任务名</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">项目名称</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">格式</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">模式</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">语言对</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">状态</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">字典</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">最新版本</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">更新时间</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-400">
                      {loadingTasks ? "正在从 /api/tasks 加载…" : "暂无任务，请先在首页导入文件。"}
                    </td>
                  </tr>
                )}
                {filtered.map((task) => (
                  <tr
                    key={task.id}
                    className={`hover:bg-slate-50 cursor-pointer ${
                      selectedTaskId === task.id ? "bg-blue-50/50" : ""
                    }`}
                    onClick={() => {
                      const shouldCollapse = task.id === selectedTaskId;
                      setSelectedTaskId(shouldCollapse ? null : task.id);
                      if (!shouldCollapse) {
                        writeCurrentTask({
                          id: task.id,
                          name: task.name,
                          format: task.format,
                          status: task.status,
                          latestVersion: task.latestVersion,
                        });
                      }
                    }}
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">{task.name}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {task.project?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">{task.format}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {task.mode === "DUAL_SOURCE" ? "中英双文件" : "单文件"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {task.sourceLocale} → {task.targetLocale}
                    </td>
                    <td className="px-5 py-3">{statusBadge(task.status)}</td>
                    <td className="px-5 py-3">{dictionarySyncBadge(task.dictionarySyncedAt)}</td>
                    <td className="px-5 py-3 text-slate-600 text-xs">v{task.latestVersion}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">{formatTime(task.updatedAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          className="text-xs text-brand-500 hover:underline inline-flex items-center gap-1"
                          aria-expanded={selectedTaskId === task.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            const shouldCollapse = task.id === selectedTaskId;
                            setSelectedTaskId(shouldCollapse ? null : task.id);
                            if (!shouldCollapse) {
                              writeCurrentTask({
                                id: task.id,
                                name: task.name,
                                format: task.format,
                                status: task.status,
                                latestVersion: task.latestVersion,
                              });
                            }
                          }}
                        >
                          {selectedTaskId === task.id ? "收起快照" : "查看快照"}
                          <ChevronDownIcon
                            size={12}
                            className={`transition-transform ${selectedTaskId === task.id ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Snapshot Detail Panel */}
        {selected && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-semibold text-sm text-slate-700">
                快照历史 · {selected.name} <span className="text-slate-400 font-normal">(最新 v{selected.latestVersion})</span>
              </h3>
              <div className="flex items-center gap-2">
                <Link
                  href="/export"
                  className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-md font-medium hover:bg-brand-600 inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                >
                  导出当前版本
                </Link>
              </div>
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-2">任务摘要</p>
                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between gap-3">
                    <span>源文件</span>
                    <span className="font-mono text-slate-700 truncate max-w-[220px]" title={selected.sourceFilename ?? ""}>
                      {selected.sourceFilename ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>目标文件</span>
                    <span className="font-mono text-slate-700 truncate max-w-[220px]" title={selected.targetFilename ?? ""}>
                      {selected.targetFilename ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>格式 / 模式</span>
                    <span className="font-medium">
                      {selected.format} · {selected.mode === "DUAL_SOURCE" ? "中英双文件" : "单文件"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>状态</span>
                    <span>{statusBadge(selected.status)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>字典库</span>
                    <span>{dictionarySyncBadge(selected.dictionarySyncedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-2">最新快照冲突摘要</p>
                {latestConflicts ? (
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>阻断（同中文不同英文）</span>
                      <span className={`font-medium ${(latestConflicts.blocking ?? 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                        {latestConflicts.blocking ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>警告（高相似度）</span>
                      <span className={`font-medium ${(latestConflicts.warning ?? 0) > 0 ? "text-amber-600" : "text-green-600"}`}>
                        {latestConflicts.warning ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Info (重复)</span>
                      <span className="font-medium text-slate-700">{latestConflicts.info ?? 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">该任务尚未生成快照。</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-2">快照版本</p>
              {loadingHistory && <p className="text-xs text-slate-400">加载快照中...</p>}
              {!loadingHistory && history.length === 0 && (
                <p className="text-xs text-slate-400">该任务暂无快照记录。</p>
              )}
              {history.length > 0 && (
                <div className="overflow-auto border border-slate-100 rounded-md">
                  <table className="w-full text-sm snapshots-nowrap-table">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">版本</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">类型</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Blocking</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Warning</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Info</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">生成时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((snap) => {
                        const summary = snap.conflictSummary ?? {};
                        return (
                          <tr className="hover:bg-slate-50" key={snap.id}>
                            <td className="px-4 py-2 font-mono text-xs text-brand-600">v{snap.version}</td>
                            <td className="px-4 py-2 text-xs text-slate-600">{snapshotKindLabel(snap.kind)}</td>
                            <td className={`px-4 py-2 text-xs ${(summary.blocking ?? 0) > 0 ? "text-red-600 font-medium" : "text-slate-500"}`}>
                              {summary.blocking ?? 0}
                            </td>
                            <td className={`px-4 py-2 text-xs ${(summary.warning ?? 0) > 0 ? "text-amber-600 font-medium" : "text-slate-500"}`}>
                              {summary.warning ?? 0}
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500">{summary.info ?? 0}</td>
                            <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">{formatTime(snap.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selected.status === "FAILED" && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <FileXIcon size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-700">任务解析失败</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      该任务状态为 FAILED；请回到首页重新导入修正后的源文件。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selected.status !== "FAILED" && latestConflicts && !latestConflicts.hasBlocking && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-xs text-green-700">
                <CheckIcon size={14} /> 最新快照无 blocking 冲突，可直接导出。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
