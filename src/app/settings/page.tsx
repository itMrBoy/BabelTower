"use client";

import { useMemo, useState } from "react";
import { AlertTriangleIcon, RefreshCwIcon, TrashIcon } from "@/components/icons";
import { useMessage } from "@/components/message-provider";
import { writeCurrentTask } from "@/lib/current-task";
import { apiFetch } from "@/lib/http-client";

type MaintenanceAction = "clear-dictionaries" | "clear-snapshots" | "reset-system";

type MaintenanceItem = {
  action: MaintenanceAction;
  title: string;
  description: string;
  scope: string;
  buttonLabel: string;
  tone: "warning" | "danger";
};

type MaintenanceResponse = {
  label?: string;
  storage?: "database" | "memory";
  localFallback?: boolean;
  clearProjects?: boolean;
  counts?: Record<string, number>;
  error?: { message?: string };
};

const maintenanceItems: MaintenanceItem[] = [
  {
    action: "clear-dictionaries",
    title: "清空字典库",
    description: "删除 Dictionary 中的中英基准数据，数据库模式会同步删除字典修订历史。",
    scope: "影响字典检索、冲突命中、保存入库后的复用翻译；不会删除项目和任务。",
    buttonLabel: "清空字典库",
    tone: "danger",
  },
  {
    action: "clear-snapshots",
    title: "清空快照",
    description: "删除所有 TaskSnapshot 版本记录，数据库模式会级联删除绑定到快照的冲突记录。",
    scope: "影响任务历史、快照回看和基于快照的导出；任务列表、项目和字典会保留。",
    buttonLabel: "清空快照",
    tone: "warning",
  },
  {
    action: "reset-system",
    title: "重置系统功能（快照、字典）",
    description: "一次性清空快照和字典库，适合重新演示或重新初始化业务数据。",
    scope: "默认影响快照历史、字典检索、冲突命中与复用翻译；可在确认时选择一并清空项目和任务。",
    buttonLabel: "重置系统",
    tone: "danger",
  },
];

function formatCounts(counts: Record<string, number> | undefined) {
  if (!counts) return "无计数信息";
  const labels: Record<string, string> = {
    dictionaries: "字典",
    dictionaryRevisions: "字典修订",
    dictionaryConflictsUpdated: "字典冲突关联",
    snapshots: "快照",
    snapshotConflicts: "快照冲突",
    projects: "项目",
    tasks: "任务",
    draftRows: "草稿行",
    projectConflicts: "项目冲突",
  };
  return Object.entries(counts)
    .map(([key, value]) => `${labels[key] ?? key} ${value}`)
    .join("，");
}

async function readBody(response: Response): Promise<MaintenanceResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as MaintenanceResponse;
  } catch {
    return {};
  }
}

export default function SettingsPage() {
  const message = useMessage();
  const [pending, setPending] = useState<MaintenanceItem | null>(null);
  const [busyAction, setBusyAction] = useState<MaintenanceAction | null>(null);
  const [lastResult, setLastResult] = useState<MaintenanceResponse | null>(null);
  const [clearProjects, setClearProjects] = useState(false);

  const storageLabel = useMemo(() => {
    if (!lastResult?.storage) return "尚未执行维护操作";
    return lastResult.storage === "database" ? "数据库存储" : "内存降级存储";
  }, [lastResult]);

  async function execute(item: MaintenanceItem) {
    setBusyAction(item.action);
    try {
      const response = await apiFetch("/api/settings/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: item.action,
          clearProjects: item.action === "reset-system" ? clearProjects : false,
        }),
      });
      const body = await readBody(response);
      if (!response.ok) {
        throw new Error(body.error?.message ?? `请求失败 (HTTP ${response.status})`);
      }
      setLastResult(body);
      if (item.action === "clear-dictionaries" || item.action === "reset-system") {
        const stamp = String(Date.now());
        window.localStorage.setItem("babeltower:dictionary-cache-bust", stamp);
        window.dispatchEvent(new Event("babeltower:dictionary-cache-bust"));
      }
      if (item.action === "reset-system" && clearProjects) {
        writeCurrentTask(null);
      }
      const storage = body.storage === "memory" ? "内存降级存储" : "数据库存储";
      message.success(`${body.label ?? item.title}完成：${storage}，${formatCounts(body.counts)}。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
      setPending(null);
      setClearProjects(false);
    }
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">System Settings</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">系统配置</h1>
              <p className="mt-2 text-sm text-slate-500 max-w-2xl">
                这里提供危险维护操作。API 会优先操作数据库；当数据库不可用时，自动切换到内存存储并返回
                localFallback 标记。
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="block text-xs text-slate-400">最近执行存储</span>
              <strong className="text-slate-800">{storageLabel}</strong>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {maintenanceItems.map((item) => {
            const isBusy = busyAction === item.action;
            const danger = item.tone === "danger";
            return (
              <section key={item.action} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                <div
                  className={
                    "w-11 h-11 rounded-xl flex items-center justify-center " +
                    (danger ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600")
                  }
                >
                  {item.action === "reset-system" ? <RefreshCwIcon size={20} /> : <TrashIcon size={20} />}
                </div>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                  <p className="text-sm text-slate-600 leading-6">{item.description}</p>
                  <p className="text-xs text-slate-500 leading-5">{item.scope}</p>
                </div>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => {
                    setPending(item);
                    setClearProjects(false);
                  }}
                  className={
                    "mt-auto h-10 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                    (danger
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-amber-500 text-white hover:bg-amber-600")
                  }
                >
                  {isBusy ? "处理中..." : item.buttonLabel}
                </button>
              </section>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon size={20} className="text-amber-500 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-slate-800">操作说明</h2>
              <p className="mt-1 text-sm text-slate-500 leading-6">
                每个危险操作都会先弹出二次警示框。确认后才会请求后端；后端根据当前可用存储分别执行数据库清理或内存清理。
              </p>
              {lastResult ? (
                <p className="mt-2 text-xs text-slate-500">
                  最近结果：{lastResult.label ?? "维护操作"}，{storageLabel}，{formatCounts(lastResult.counts)}
                  {lastResult.localFallback ? "，已启用 localFallback" : ""}。
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangleIcon size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">二次确认：{pending.title}</h2>
                <p className="mt-1 text-sm text-slate-500 leading-6">
                  该操作不可撤销，请确认当前环境和数据范围无误。
                </p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 leading-6">
                {pending.scope}
              </div>
              <p className="text-sm text-slate-600 leading-6">
                后端会自动区分数据库存储与内存存储；如果数据库不可用，将只清理当前 Node.js 进程内的内存数据。
              </p>
              {pending.action === "reset-system" ? (
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    checked={clearProjects}
                    disabled={busyAction !== null}
                    onChange={(event) => setClearProjects(event.target.checked)}
                  />
                  <span>
                    <span className="block font-medium text-slate-800">同时清空项目和项目下任务</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      勾选后会删除所有项目，并连带删除项目下任务、草稿行、快照历史和任务冲突；不勾选时只清空快照和字典。
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
            <div className="px-5 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button
                type="button"
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
                disabled={busyAction !== null}
                onClick={() => setPending(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                disabled={busyAction !== null}
                onClick={() => void execute(pending)}
              >
                {busyAction === pending.action ? "执行中..." : `确认${pending.buttonLabel}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
