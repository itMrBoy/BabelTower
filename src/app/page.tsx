"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CloudUploadIcon,
  CheckCircleIcon,
  LoaderIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  PlusIcon,
  CheckIcon,
  InfoIcon,
  XIcon,
} from "@/components/icons";
import { writeCurrentTask } from "@/lib/current-task";

type Project = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  updatedAt?: string;
};

type Task = {
  id: string;
  name: string;
  status: string;
  mode: string;
  format: string;
  latestVersion: number;
  sourceFilename?: string | null;
  targetFilename?: string | null;
  sourceLocale?: string;
  targetLocale?: string;
  createdAt?: string;
  updatedAt?: string;
};

type PreviewRow = {
  key: string;
  keyPath: string[];
  sourceValue: string | null;
  translatedValue: string | null;
  status: string;
};

type ConflictSummary = {
  blocking: number;
  warning: number;
  info: number;
  hasBlocking: boolean;
};

type Snapshot = {
  id: string;
  version: number;
  kind: string;
};

type PipelineState = "idle" | "running" | "done" | "warning" | "error";

interface PipelineStep {
  key: string;
  label: string;
  subLabel: string;
  state: PipelineState;
}

interface Notice {
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  message: string;
}

const emptyConflictSummary: ConflictSummary = {
  blocking: 0,
  warning: 0,
  info: 0,
  hasBlocking: false,
};

const SUPPORTED_FORMATS = [".json", ".properties"] as const;

function nowCode() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `BT-${stamp}`;
}

function detectFormat(file: File | null): "json" | "properties" {
  if (!file) return "json";
  return file.name.toLowerCase().endsWith(".properties") ? "properties" : "json";
}

function getErrorMessage(body: unknown, fallbackStatus?: number) {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallbackStatus ? `请求失败 (HTTP ${fallbackStatus})` : "请求失败";
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(getErrorMessage(body, response.status));
  }
  return body as T;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function fileSizeLabel(file: File | null) {
  if (!file) return null;
  if (file.size < 1024) return `${file.size} B`;
  if (file.size < 1024 * 1024) return `${(file.size / 1024).toFixed(1)} KB`;
  return `${(file.size / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return date.toISOString().slice(0, 10);
}

function statusDot(status: string) {
  const upper = status.toUpperCase();
  if (upper === "DRAFT") return { color: "bg-amber-500", text: "text-amber-600", label: "Processing" };
  if (upper === "IN_REVIEW") return { color: "bg-blue-500", text: "text-blue-600", label: "Review" };
  if (upper === "SAVED") return { color: "bg-green-500", text: "text-green-600", label: "Completed" };
  if (upper === "FAILED") return { color: "bg-red-500", text: "text-red-600", label: "Failed" };
  if (upper === "READ_ONLY_HISTORY") return { color: "bg-slate-400", text: "text-slate-500", label: "Archived" };
  return { color: "bg-slate-300", text: "text-slate-500", label: status };
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("BabelTower Demo");
  const [projectCode, setProjectCode] = useState(nowCode);

  const [taskName, setTaskName] = useState("");
  const [format, setFormat] = useState<"json" | "properties">("json");
  const [mode, setMode] = useState<"SINGLE_SOURCE" | "DUAL_SOURCE">("SINGLE_SOURCE");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [task, setTask] = useState<Task | null>(null);
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictSummary>(emptyConflictSummary);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStep[]>(buildInitialPipeline());

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const response = await requestJson<{ items: Project[] }>("/api/projects?limit=20");
      setProjects(response.items);
      setSelectedProjectId((current) => current || response.items[0]?.id || "");
      if (response.items.length === 0) {
        setShowProjectForm(true);
        setNotice({
          tone: "info",
          title: "暂无项目",
          message: "先在右侧创建一个项目，再回到文件上传步骤。",
        });
      }
    } catch (error) {
      setNotice({
        tone: "warn",
        title: "项目列表暂时不可用",
        message: `${formatError(error)}。若本地数据库未初始化，请运行 Prisma 迁移后重试。`,
      });
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const query = selectedProjectId ? `?projectId=${selectedProjectId}` : "";
      const response = await requestJson<{ items: Task[] }>(`/api/tasks${query}`);
      setTasks(response.items);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!task) return;
    writeCurrentTask({
      id: task.id,
      name: task.name,
      format: task.format,
      status: task.status,
      latestVersion: snapshotVersion || task.latestVersion,
      projectId: selectedProjectId || undefined,
    });
  }, [task, snapshotVersion, selectedProjectId]);

  async function createProject() {
    if (!projectName.trim() || !projectCode.trim()) {
      setNotice({ tone: "bad", title: "请填写项目信息", message: "项目 Code 和名称都不能为空。" });
      return;
    }
    setBusy("createProject");
    try {
      const response = await requestJson<{ project: Project }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: projectCode.trim(),
          name: projectName.trim(),
          description: "Created from BabelTower console",
        }),
      });
      setProjects((current) => [response.project, ...current]);
      setSelectedProjectId(response.project.id);
      setShowProjectForm(false);
      setProjectCode(nowCode());
      setNotice({
        tone: "good",
        title: "项目已创建",
        message: `当前项目：${response.project.name}，可以开始上传源文件。`,
      });
    } catch (error) {
      setNotice({ tone: "bad", title: "创建项目失败", message: formatError(error) });
    } finally {
      setBusy(null);
    }
  }

  function chooseFile(target: "source" | "target", file: File | null) {
    if (target === "source") {
      setSourceFile(file);
      setFormat(detectFormat(file));
      if (file && !taskName.trim()) setTaskName(file.name);
    } else {
      setTargetFile(file);
      if (file) setMode("DUAL_SOURCE");
    }
  }

  function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!SUPPORTED_FORMATS.some((suffix) => lower.endsWith(suffix))) {
      setNotice({
        tone: "bad",
        title: "暂不支持的格式",
        message: `当前只支持 ${SUPPORTED_FORMATS.join(" / ")}，请选择正确的文件。`,
      });
      return;
    }
    chooseFile("source", file);
  }

  async function importTask() {
    if (!selectedProjectId) {
      setNotice({ tone: "bad", title: "请先选择项目", message: "TranslationTask 必须归属一个 ProductProject。" });
      return;
    }
    if (!sourceFile) {
      setNotice({ tone: "bad", title: "请选择源文件", message: "支持 JSON 和 .properties 文件。" });
      return;
    }
    if (mode === "DUAL_SOURCE" && !targetFile) {
      setNotice({ tone: "bad", title: "缺少英文目标文件", message: "双文件模式下必须同时上传中英文件。" });
      return;
    }

    setBusy("importTask");
    setPipeline(buildRunningPipeline());
    setNotice(null);

    try {
      const form = new FormData();
      form.append("projectId", selectedProjectId);
      form.append("name", (taskName.trim() || sourceFile.name).slice(0, 200));
      form.append("format", format);
      form.append("mode", mode);
      form.append("sourceLocale", "zh-CN");
      form.append("targetLocale", "en-US");
      form.append("sourceFile", sourceFile);
      if (targetFile) form.append("targetFile", targetFile);

      const response = await requestJson<{
        task: Task;
        latestSnapshot: Snapshot;
        previewRows: PreviewRow[];
        conflictSummary: ConflictSummary;
      }>("/api/tasks", {
        method: "POST",
        body: form,
      });

      setTask(response.task);
      setRows(response.previewRows);
      setSnapshotVersion(response.latestSnapshot.version);
      setConflicts(response.conflictSummary);
      setTasks((current) => [response.task, ...current.filter((item) => item.id !== response.task.id)]);
      setPipeline(buildDonePipeline(response.conflictSummary));
      setNotice({
        tone: response.conflictSummary.hasBlocking ? "warn" : "good",
        title: response.conflictSummary.hasBlocking ? "解析完成，检测到 blocking 冲突" : "文件已解析为 Standard JSON",
        message: `生成 ${response.previewRows.length} 行预览；blocking ${response.conflictSummary.blocking}，warning ${response.conflictSummary.warning}。`,
      });
    } catch (error) {
      setPipeline(buildErrorPipeline());
      setNotice({ tone: "bad", title: "导入失败", message: formatError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function snapshotDraft() {
    if (!task || !snapshotVersion) return;
    setBusy("snapshot");
    try {
      const response = await requestJson<{ snapshot: Snapshot }>(`/api/tasks/${task.id}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseVersion: snapshotVersion, previewRows: rows }),
      });
      setSnapshotVersion(response.snapshot.version);
      setNotice({
        tone: "good",
        title: "已生成手动快照",
        message: `TaskSnapshot v${response.snapshot.version} 已写入。`,
      });
    } catch (error) {
      setNotice({ tone: "bad", title: "暂存失败", message: formatError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function saveToDictionary() {
    if (!task || !snapshotVersion) return;
    setBusy("save");
    try {
      const response = await fetch(`/api/tasks/${task.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotVersion }),
      });
      const body = await readBody(response);
      if (response.status === 409) {
        setNotice({
          tone: "warn",
          title: "保存前需处理 blocking 冲突",
          message: "请到「Conflict Handling」按 KEEP_EXISTING / UPDATE_DICTIONARY 协议确认后再保存。",
        });
        return;
      }
      if (!response.ok) throw new Error(getErrorMessage(body, response.status));
      const result = body as { dictionarySync?: { created: number; updated: number; skipped: number }; snapshot?: Snapshot };
      if (result.snapshot?.version) setSnapshotVersion(result.snapshot.version);
      setNotice({
        tone: "good",
        title: "已写入 Dictionary",
        message: `新增 ${result.dictionarySync?.created ?? 0}，更新 ${result.dictionarySync?.updated ?? 0}，跳过 ${result.dictionarySync?.skipped ?? 0}。`,
      });
    } catch (error) {
      setNotice({ tone: "bad", title: "保存失败", message: formatError(error) });
    } finally {
      setBusy(null);
    }
  }

  const completedRows = useMemo(
    () => rows.filter((row) => row.translatedValue && row.translatedValue.trim().length > 0).length,
    [rows],
  );

  const isWorking = busy !== null;
  const currentTaskStatus = task ? statusDot(task.status) : null;

  return (
    <div className="px-8 py-8 space-y-8 max-w-[1440px] mx-auto">
      {notice && (
        <Toast notice={notice} onClose={() => setNotice(null)} />
      )}

      {/* PROJECT + UPLOAD */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr,360px] gap-6">
        {/* File Upload Card */}
        <section className="card p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">File Upload</h2>
              <p className="text-xs text-slate-500 mt-1">支持 JSON / .properties，上传后即开始解析与冲突检测。</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">当前项目</span>
              <select
                className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 max-w-[220px]"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                disabled={projectsLoading || isWorking}
              >
                {projects.length === 0 ? (
                  <option value="">{projectsLoading ? "项目加载中…" : "请先创建项目"}</option>
                ) : (
                  <>
                    <option value="">未选择</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} · {project.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <button
                type="button"
                onClick={() => setShowProjectForm((current) => !current)}
                className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                <PlusIcon size={12} /> {showProjectForm ? "收起" : "新建项目"}
              </button>
            </div>
          </div>

          {showProjectForm && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3 items-end bg-slate-50 rounded-md px-4 py-3 border border-slate-100">
              <label className="text-xs text-slate-500 space-y-1.5">
                <span className="block">项目 Code</span>
                <input
                  className="field-input"
                  value={projectCode}
                  onChange={(event) => setProjectCode(event.target.value)}
                  placeholder="BT-yyyymmddhhmm"
                />
              </label>
              <label className="text-xs text-slate-500 space-y-1.5">
                <span className="block">项目名称</span>
                <input
                  className="field-input"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="产品 / 子项目名称"
                />
              </label>
              <button
                type="button"
                onClick={createProject}
                disabled={busy === "createProject"}
                className="btn-primary"
              >
                {busy === "createProject" ? <LoaderIcon size={16} className="animate-spin" /> : <PlusIcon size={16} />}
                {busy === "createProject" ? "创建中…" : "创建项目"}
              </button>
            </div>
          )}

          {/* Dropzone */}
          <label
            htmlFor="source-file-input"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={
              "block rounded-xl border-2 border-dashed px-6 py-12 transition-colors cursor-pointer text-center " +
              (isDragging
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40")
            }
          >
            <input
              id="source-file-input"
              type="file"
              accept=".json,.properties"
              className="hidden"
              onChange={(event) => chooseFile("source", event.target.files?.[0] ?? null)}
            />
            <CloudUploadIcon size={36} className="mx-auto text-brand-500" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {sourceFile ? sourceFile.name : "拖入翻译文件，或点击选择"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {sourceFile
                ? `${fileSizeLabel(sourceFile)} · ${format.toUpperCase()}`
                : `支持格式：${SUPPORTED_FORMATS.join("  ")}`}
            </p>
          </label>

          {/* Mode + target file */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3 items-end">
            <label className="text-xs text-slate-500 space-y-1.5">
              <span className="block">任务名称</span>
              <input
                className="field-input"
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                placeholder="如：messages.zh-CN.json"
              />
            </label>
            <div className="text-xs text-slate-500 space-y-1.5">
              <span className="block">上传模式</span>
              <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-sm w-full">
                <button
                  type="button"
                  onClick={() => {
                    setMode("SINGLE_SOURCE");
                    setTargetFile(null);
                  }}
                  className={
                    "flex-1 px-3 py-1.5 rounded font-medium transition-colors " +
                    (mode === "SINGLE_SOURCE"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  单文件
                </button>
                <button
                  type="button"
                  onClick={() => setMode("DUAL_SOURCE")}
                  className={
                    "flex-1 px-3 py-1.5 rounded font-medium transition-colors " +
                    (mode === "DUAL_SOURCE"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  中英双文件
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={importTask}
              disabled={isWorking || !sourceFile || !selectedProjectId}
              className="btn-primary px-5 h-[38px]"
            >
              {busy === "importTask" ? (
                <>
                  <LoaderIcon size={16} className="animate-spin" /> 解析中…
                </>
              ) : (
                <>
                  解析并生成预览 <ArrowRightIcon size={14} />
                </>
              )}
            </button>
          </div>

          {mode === "DUAL_SOURCE" && (
            <label
              htmlFor="target-file-input"
              className="block rounded-md border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-600 cursor-pointer hover:border-brand-300 hover:bg-brand-50/40"
            >
              <input
                id="target-file-input"
                type="file"
                accept=".json,.properties"
                className="hidden"
                onChange={(event) => chooseFile("target", event.target.files?.[0] ?? null)}
              />
              <span className="text-xs text-slate-500 uppercase tracking-wider">英文目标文件</span>
              <p className="mt-1">{targetFile ? `${targetFile.name} · ${fileSizeLabel(targetFile)}` : "点击选择 .json / .properties 文件"}</p>
            </label>
          )}
        </section>

        {/* Right column: live status + recent uploads */}
        <aside className="space-y-5">
          <section className="card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">当前任务</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 break-all min-h-[1.25rem]">
                  {task?.name ?? "等待上传文件"}
                </p>
              </div>
              {currentTaskStatus && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full ${currentTaskStatus.color}`} />
                  <span className={currentTaskStatus.text}>{currentTaskStatus.label}</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="预览行" value={rows.length} />
              <Metric label="Blocking" value={conflicts.blocking} tone={conflicts.blocking > 0 ? "danger" : "muted"} />
              <Metric label="Warning" value={conflicts.warning} tone={conflicts.warning > 0 ? "warn" : "muted"} />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={snapshotDraft}
                disabled={!task || isWorking}
                className="btn-secondary text-xs h-[36px]"
              >
                {busy === "snapshot" ? "生成中…" : "生成快照"}
              </button>
              <button
                type="button"
                onClick={saveToDictionary}
                disabled={!task || isWorking || conflicts.hasBlocking}
                className="btn-primary text-xs h-[36px]"
              >
                {busy === "save" ? "保存中…" : "保存入 Dictionary"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/conflicts"
                className={
                  "text-xs text-center rounded-md border px-3 py-2 transition-colors " +
                  (conflicts.hasBlocking
                    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                查看冲突 →
              </Link>
              <Link
                href="/export"
                className="text-xs text-center rounded-md border border-slate-200 text-slate-600 px-3 py-2 hover:bg-slate-50"
              >
                打开导出 →
              </Link>
            </div>
            {rows.length > 0 && (
              <p className="text-[11px] text-slate-400">已完成翻译 {completedRows} / {rows.length} 行</p>
            )}
          </section>

          <section className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Recent Uploads</h3>
              <button
                type="button"
                onClick={() => void loadTasks()}
                disabled={tasksLoading}
                className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
              >
                <RefreshCwIcon size={12} /> 刷新
              </button>
            </div>
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">暂无任务，上传后会出现在这里。</p>
              ) : (
                tasks.slice(0, 4).map((item) => {
                  const dot = statusDot(item.status);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTask(item);
                        setSnapshotVersion(item.latestVersion);
                        setRows([]);
                        setConflicts(emptyConflictSummary);
                        setPipeline(buildInitialPipeline());
                        setNotice({
                          tone: "info",
                          title: "已选中历史任务",
                          message: "本视图只显示任务摘要，详细预览请到 Task Snapshots 页面查看。",
                        });
                      }}
                      className="w-full text-left rounded-md border border-slate-100 px-3 py-2 hover:border-brand-200 hover:bg-brand-50/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">{item.name}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] ${dot.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dot.color}`} />
                          {dot.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                        <span>{item.format}</span>
                        <span>v{item.latestVersion}</span>
                        <span>{timeAgo(item.updatedAt ?? item.createdAt)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* PIPELINE STATUS */}
      <section className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pipeline Status</h2>
            <p className="text-xs text-slate-500 mt-1">Input → Parser → Standard → Conflict → Database</p>
          </div>
          <span className="text-xs text-slate-500">数据来源：/api/tasks · /api/dictionaries/conflicts</span>
        </div>
        <PipelineSteps steps={pipeline} />
      </section>

      {/* PARSE RESULTS PREVIEW */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Parse Results Preview</h2>
            <p className="text-xs text-slate-500 mt-1">前 30 行预览，可直接修改后续步骤再保存。</p>
          </div>
          <span className="text-xs text-slate-500">{rows.length.toLocaleString()} entries parsed</span>
        </div>

        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">上传并解析文件后，这里会显示 Standard JSON 预览。</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.slice(0, 30).map((row, index) => (
              <li key={`${row.key}-${index}`} className="px-6 py-3 flex items-center gap-4">
                <code className="text-xs font-mono text-brand-700 bg-brand-50 rounded px-2 py-1 max-w-[35%] truncate">
                  {row.keyPath.join(".")}
                </code>
                <ArrowRightIcon size={14} className="text-slate-300 flex-shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-3 text-sm">
                  <span className="text-slate-800 truncate" title={row.sourceValue ?? ""}>
                    {row.sourceValue ?? <span className="text-slate-300">—</span>}
                  </span>
                  <span className="text-slate-500 truncate" title={row.translatedValue ?? ""}>
                    {row.translatedValue ?? <span className="text-slate-300">待翻译</span>}
                  </span>
                </div>
                <RowStatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        )}
        {rows.length > 30 && (
          <div className="px-6 py-3 border-t border-slate-100 text-center">
            <Link
              href="/snapshots"
              className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
            >
              查看完整 {rows.length} 行预览 <ArrowRightIcon size={12} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "danger" | "warn" | "good";
}) {
  const map = {
    muted: "text-slate-800",
    danger: "text-red-600",
    warn: "text-amber-600",
    good: "text-green-600",
  } as const;
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2 border border-slate-100">
      <p className="text-[11px] text-slate-500 leading-none">{label}</p>
      <p className={`mt-1 text-lg font-semibold leading-none ${map[tone]}`}>{value}</p>
    </div>
  );
}

function RowStatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  if (upper === "DUPLICATED_KEY") {
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">duplicate</span>;
  }
  if (upper === "UNSUPPORTED_VALUE") {
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">parse error</span>;
  }
  if (upper === "NORMAL") {
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">normal</span>;
  }
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{status}</span>;
}

function PipelineSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {steps.map((step, index) => (
        <div key={step.key} className="flex items-center gap-2 flex-shrink-0">
          <PipelineStepNode step={step} index={index} />
          {index < steps.length - 1 && (
            <ArrowRightIcon size={16} className="text-slate-300 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

function PipelineStepNode({ step, index }: { step: PipelineStep; index: number }) {
  const isDone = step.state === "done";
  const isRunning = step.state === "running";
  const isWarn = step.state === "warning";
  const isError = step.state === "error";
  const idle = step.state === "idle";

  const circleClass =
    isError
      ? "bg-red-500 text-white"
      : isWarn
        ? "bg-amber-500 text-white"
        : isDone
          ? "bg-green-500 text-white"
          : isRunning
            ? "bg-brand-500 text-white"
            : "bg-slate-200 text-slate-400";

  const labelClass = isRunning
    ? "text-brand-700 font-semibold"
    : isError || isWarn
      ? "text-slate-700 font-semibold"
      : "text-slate-700 font-medium";

  return (
    <div className="flex flex-col items-center gap-2 min-w-[100px]">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm ${circleClass}`}>
        {isDone && <CheckIcon size={20} />}
        {isRunning && <LoaderIcon size={20} className="animate-spin" />}
        {isWarn && <AlertTriangleIcon size={20} />}
        {isError && <XIcon size={20} />}
        {idle && <span className="text-sm font-semibold">{index + 1}</span>}
      </div>
      <div className="text-center">
        <p className={`text-xs ${labelClass}`}>{step.label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{step.subLabel}</p>
      </div>
    </div>
  );
}

function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const palette = {
    good: { border: "border-green-200", bg: "bg-green-50", text: "text-green-800", icon: <CheckCircleIcon size={18} className="text-green-600" /> },
    warn: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-800", icon: <AlertTriangleIcon size={18} className="text-amber-600" /> },
    bad: { border: "border-red-200", bg: "bg-red-50", text: "text-red-800", icon: <AlertTriangleIcon size={18} className="text-red-600" /> },
    info: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-800", icon: <InfoIcon size={18} className="text-blue-600" /> },
  }[notice.tone];

  return (
    <div className={`rounded-md border ${palette.border} ${palette.bg} px-4 py-3 flex items-start gap-3`}>
      {palette.icon}
      <div className={`flex-1 ${palette.text}`}>
        <p className="text-sm font-medium">{notice.title}</p>
        <p className="text-xs mt-0.5">{notice.message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`${palette.text} opacity-60 hover:opacity-100`}
        aria-label="dismiss"
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}

function buildInitialPipeline(): PipelineStep[] {
  return [
    { key: "input", label: "Input", subLabel: "等待文件", state: "idle" },
    { key: "parser", label: "Parser", subLabel: "JSON / properties", state: "idle" },
    { key: "standard", label: "Standard JSON", subLabel: "标准化结构", state: "idle" },
    { key: "conflict", label: "Conflict Check", subLabel: "4 类冲突", state: "idle" },
    { key: "database", label: "Database", subLabel: "持久化快照", state: "idle" },
  ];
}

function buildRunningPipeline(): PipelineStep[] {
  return [
    { key: "input", label: "Input", subLabel: "文件已上传", state: "done" },
    { key: "parser", label: "Parser", subLabel: "解析中…", state: "running" },
    { key: "standard", label: "Standard JSON", subLabel: "等待解析", state: "idle" },
    { key: "conflict", label: "Conflict Check", subLabel: "等待解析", state: "idle" },
    { key: "database", label: "Database", subLabel: "等待解析", state: "idle" },
  ];
}

function buildDonePipeline(summary: ConflictSummary): PipelineStep[] {
  return [
    { key: "input", label: "Input", subLabel: "文件已上传", state: "done" },
    { key: "parser", label: "Parser", subLabel: "解析完成", state: "done" },
    { key: "standard", label: "Standard JSON", subLabel: "标准化完成", state: "done" },
    {
      key: "conflict",
      label: "Conflict Check",
      subLabel: summary.hasBlocking
        ? `${summary.blocking} blocking · ${summary.warning} warning`
        : `0 conflicts`,
      state: summary.hasBlocking ? "warning" : "done",
    },
    {
      key: "database",
      label: "Database",
      subLabel: "快照已写入",
      state: "done",
    },
  ];
}

function buildErrorPipeline(): PipelineStep[] {
  return [
    { key: "input", label: "Input", subLabel: "文件已上传", state: "done" },
    { key: "parser", label: "Parser", subLabel: "解析失败", state: "error" },
    { key: "standard", label: "Standard JSON", subLabel: "等待重试", state: "idle" },
    { key: "conflict", label: "Conflict Check", subLabel: "等待重试", state: "idle" },
    { key: "database", label: "Database", subLabel: "等待重试", state: "idle" },
  ];
}
