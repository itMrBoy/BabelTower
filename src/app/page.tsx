"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { writeCurrentTask } from "@/lib/current-task";
import {
  exportValidationKey,
  summarizeExportValidationErrors,
  type ExportValidationError,
} from "@/lib/export-validation";
import { apiFetch } from "@/lib/http-client";
import { useMessage } from "@/components/message-provider";

type Project = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  updatedAt?: string;
};

type Task = {
  id: string;
  projectId?: string;
  name: string;
  status: string;
  isEditable?: boolean;
  mode: string;
  format: string;
  latestVersion: number;
  sourceFilename?: string | null;
  targetFilename?: string | null;
  dictionarySyncedAt?: string | null;
  updatedAt?: string;
};

type PreviewRow = {
  key: string;
  keyPath: string[];
  sourceValue: string | null;
  translatedValue: string | null;
  status: string;
  conflictLevel?: "blocking" | "warning" | "info";
};

type ConflictSummary = {
  blocking: number;
  warning: number;
  info: number;
  hasBlocking: boolean;
};

type DictionaryEntry = {
  id: string;
  chineseText: string;
  englishText: string;
  usageCount: number;
  tags: string[];
  note?: string | null;
  updatedAt?: string;
};

type Snapshot = {
  id: string;
  version: number;
  kind: string;
};

type RowPatch = Partial<Pick<PreviewRow, "sourceValue" | "translatedValue" | "status" | "conflictLevel">> & {
  key: string;
  rowKey: string;
  rowIndex: number;
  keyPath: string[];
};

type SaveState = "idle" | "saving" | "saved" | "error";
type RequiredPreviewField = "sourceValue" | "translatedValue";
type InvalidRequiredFields = Partial<Record<string, Partial<Record<RequiredPreviewField, boolean>>>>;


const emptyConflictSummary: ConflictSummary = {
  blocking: 0,
  warning: 0,
  info: 0,
  hasBlocking: false,
};

const pipeline = [
  "文件输入",
  "格式解析",
  "标准结构",
  "冲突检测",
  "字典入库",
];

function getErrorMessage(body: unknown, fallbackStatus?: number) {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallbackStatus ? `Request failed with status ${fallbackStatus}` : "Request failed";
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
  const response = await apiFetch(input, init);
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(getErrorMessage(body, response.status));
  }
  return body as T;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readValidationErrors(body: Record<string, unknown>) {
  return Array.isArray(body.validationErrors)
    ? body.validationErrors.filter(
        (item): item is ExportValidationError =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as ExportValidationError).field === "string" &&
          typeof (item as ExportValidationError).message === "string",
      )
    : [];
}

function fileSizeLabel(file: File | null) {
  if (!file) return "未选择文件";
  if (file.size < 1024) return `${file.name} · ${file.size} B`;
  if (file.size < 1024 * 1024) return `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  return `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
}

type PersistedState = {
  selectedProjectId: string;
  projectName: string;
  projectCode: string;
  taskName: string;
  format: "json" | "properties" | "ts";
  mode: "SINGLE_SOURCE" | "DUAL_SOURCE";
  task: Task | null;
  snapshotVersion: number;
  conflicts: ConflictSummary;
  dictionaryQuery: string;
  dictionaryChinese: string;
  dictionaryEnglish: string;
};

const defaultPersistedState: PersistedState = {
  selectedProjectId: "",
  projectName: "",
  projectCode: "",
  taskName: "首次导入任务",
  format: "json",
  mode: "SINGLE_SOURCE",
  task: null,
  snapshotVersion: 0,
  conflicts: emptyConflictSummary,
  dictionaryQuery: "确认",
  dictionaryChinese: "",
  dictionaryEnglish: "",
};

let workspaceStateCache: PersistedState = defaultPersistedState;

function loadPersistedState(): PersistedState {
  return workspaceStateCache;
}

function writePersistedState(nextState: PersistedState) {
  workspaceStateCache = nextState;
}

function AutoSizeTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onInput={(event) => {
        const target = event.currentTarget;
        target.style.height = "auto";
        target.style.height = `${target.scrollHeight}px`;
        props.onInput?.(event);
      }}
    />
  );
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultPersistedState.selectedProjectId);
  const [projectName, setProjectName] = useState(defaultPersistedState.projectName);
  const [projectCode, setProjectCode] = useState(defaultPersistedState.projectCode);
  const [taskName, setTaskName] = useState(defaultPersistedState.taskName);
  const [format, setFormat] = useState<"json" | "properties" | "ts">(defaultPersistedState.format);
  const [mode, setMode] = useState<"SINGLE_SOURCE" | "DUAL_SOURCE">(defaultPersistedState.mode);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [task, setTask] = useState<Task | null>(defaultPersistedState.task);
  const [snapshotVersion, setSnapshotVersion] = useState(defaultPersistedState.snapshotVersion);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictSummary>(defaultPersistedState.conflicts);
  const [dictionaryQuery, setDictionaryQuery] = useState(defaultPersistedState.dictionaryQuery);
  const [dictionaryResults, setDictionaryResults] = useState<DictionaryEntry[]>([]);
  const [dictionaryChinese, setDictionaryChinese] = useState(defaultPersistedState.dictionaryChinese);
  const [dictionaryEnglish, setDictionaryEnglish] = useState(defaultPersistedState.dictionaryEnglish);
  const [dictionaryHits, setDictionaryHits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<string, Partial<PreviewRow>>>({});
  const [invalidRequiredFields, setInvalidRequiredFields] = useState<InvalidRequiredFields>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [scrollTop, setScrollTop] = useState(0);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const pendingPatches = useRef<Map<string, RowPatch>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const message = useMessage();

  useEffect(() => {
    const persisted = loadPersistedState();
    setSelectedProjectId(persisted.selectedProjectId);
    setProjectName(persisted.projectName);
    setProjectCode(persisted.projectCode);
    setTaskName(persisted.taskName);
    setFormat(persisted.format);
    setMode(persisted.mode);
    setTask(persisted.task);
    setSnapshotVersion(persisted.snapshotVersion);
    setConflicts(persisted.conflicts);
    setDictionaryQuery(persisted.dictionaryQuery);
    setDictionaryChinese(persisted.dictionaryChinese);
    setDictionaryEnglish(persisted.dictionaryEnglish);
    setHydrated(true);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot: PersistedState = {
      selectedProjectId,
      projectName,
      projectCode,
      taskName,
      format,
      mode,
      task,
      snapshotVersion,
      conflicts,
      dictionaryQuery,
      dictionaryChinese,
      dictionaryEnglish,
    };
    writePersistedState(snapshot);
  }, [
    hydrated,
    selectedProjectId,
    projectName,
    projectCode,
    taskName,
    format,
    mode,
    task,
    snapshotVersion,
    conflicts,
    dictionaryQuery,
    dictionaryChinese,
    dictionaryEnglish,
  ]);

  const mergedRows = useMemo(
    () => rows.map((row) => ({ ...row, ...(rowEdits[row.key] ?? {}) })),
    [rows, rowEdits],
  );
  const completedRows = useMemo(
    () => mergedRows.filter((row) => row.translatedValue && row.translatedValue.trim().length > 0).length,
    [mergedRows],
  );
  const progress = rows.length ? Math.round((completedRows / rows.length) * 100) : 0;
  const canEditDraft = Boolean(task && task.status === "DRAFT" && task.isEditable !== false);

  const visibleRowHeight = 74;
  const viewportHeight = 620;
  const overscan = 12;
  const virtualStart = Math.max(0, Math.floor(scrollTop / visibleRowHeight) - overscan);
  const virtualEnd = Math.min(
    mergedRows.length,
    Math.ceil((scrollTop + viewportHeight) / visibleRowHeight) + overscan,
  );
  const visibleRows = mergedRows.slice(virtualStart, virtualEnd);
  const topSpacerHeight = virtualStart * visibleRowHeight;
  const bottomSpacerHeight = Math.max(0, (mergedRows.length - virtualEnd) * visibleRowHeight);

  function ensureNoEmptyPreviewValues(actionLabel: string) {
    const invalidFields: InvalidRequiredFields = {};
    let firstInvalidIndex = -1;
    let sourceMissing = 0;
    let translatedMissing = 0;

    mergedRows.forEach((row, rowIndex) => {
      const missingSource = !row.sourceValue?.trim();
      const missingTranslated = !row.translatedValue?.trim();
      if (!missingSource && !missingTranslated) return;

      if (firstInvalidIndex === -1) firstInvalidIndex = rowIndex;
      invalidFields[row.key] = {
        ...(missingSource ? { sourceValue: true } : {}),
        ...(missingTranslated ? { translatedValue: true } : {}),
      };
      if (missingSource) sourceMissing += 1;
      if (missingTranslated) translatedMissing += 1;
    });

    setInvalidRequiredFields(invalidFields);
    if (firstInvalidIndex === -1) return true;

    const nextScrollTop = firstInvalidIndex * visibleRowHeight;
    setScrollTop(nextScrollTop);
    if (tableWrapRef.current) tableWrapRef.current.scrollTop = nextScrollTop;
    message.error(`存在空值，无法${actionLabel}：中文基准缺失 ${sourceMissing} 处，英文译文缺失 ${translatedMissing} 处。`);
    return false;
  }

  function showExportValidationErrors(errors: ExportValidationError[]) {
    const invalidFields: InvalidRequiredFields = {};
    let firstInvalidIndex = -1;

    for (const error of errors) {
      const key = exportValidationKey(error.field);
      if (firstInvalidIndex === -1) {
        const rowIndex = mergedRows.findIndex((row) => row.key === key);
        if (rowIndex >= 0) firstInvalidIndex = rowIndex;
      }
      invalidFields[key] = {
        ...(error.field.endsWith(".sourceValue") ? { sourceValue: true } : {}),
        ...(error.field.endsWith(".translatedValue") ? { translatedValue: true } : {}),
      };
    }

    setInvalidRequiredFields(invalidFields);
    if (firstInvalidIndex >= 0) {
      const nextScrollTop = firstInvalidIndex * visibleRowHeight;
      setScrollTop(nextScrollTop);
      if (tableWrapRef.current) tableWrapRef.current.scrollTop = nextScrollTop;
    }
    message.error(summarizeExportValidationErrors(errors));
  }

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function loadProjects() {
      try {
        const response = await requestJson<{ items: Project[] }>("/api/projects?limit=20");
        if (!cancelled) {
          setProjects(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          message.warning(`${formatError(error)}。如果本地数据库还没启动，先执行 Prisma/数据库初始化后再使用完整流程。`);
        }
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!selectedProjectId) return;
    const matched = projects.find((project) => project.id === selectedProjectId);
    if (!matched) return;
    setProjectCode(matched.code);
    setProjectName(matched.name);
  }, [hydrated, selectedProjectId, projects]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function loadTasks() {
      const query = selectedProjectId ? `?projectId=${selectedProjectId}` : "";
      try {
        const response = await requestJson<{ items: Task[] }>(`/api/tasks${query}`);
        if (!cancelled) setTasks(response.items);
      } catch {
        if (!cancelled) setTasks([]);
      }
    }

    void loadTasks();
    return () => {
      cancelled = true;
    };
  }, [hydrated, selectedProjectId]);

  useEffect(() => {
    if (!hydrated || !task?.id || rows.length > 0) return;
    let cancelled = false;
    const taskId = task.id;

    async function loadTaskDetail() {
      try {
        const response = await requestJson<{
          task: Task;
          latestSnapshot?: Snapshot | null;
          previewRows?: PreviewRow[];
        }>(`/api/tasks/${taskId}`);
        if (cancelled) return;
        setTask(response.task);
        setSnapshotVersion(response.latestSnapshot?.version ?? response.task.latestVersion);
        setRows(response.previewRows ?? []);
        setRowEdits({});
        setInvalidRequiredFields({});
      } catch (error) {
        if (!cancelled) message.warning(`任务草稿恢复失败：${formatError(error)}`);
      }
    }

    void loadTaskDetail();
    return () => {
      cancelled = true;
    };
  }, [hydrated, task?.id, rows.length]);

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

  async function saveProject() {
    const nextName = projectName.trim();
    if (!nextName) {
      message.error("项目名称不能为空。");
      return;
    }

    const duplicate = projects.find(
      (project) => project.id !== selectedProjectId && project.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      message.error(`项目名称「${nextName}」已存在，请换一个名称。`);
      return;
    }

    if (selectedProjectId) {
      const matched = projects.find((project) => project.id === selectedProjectId);
      if (matched && matched.name === nextName) {
        message.info(`已使用项目：${matched.name}。`);
        return;
      }
    }

    setBusy("createProject");
    try {
      const response = await requestJson<{ project: Project; existed?: boolean }>(
        selectedProjectId ? `/api/projects/${selectedProjectId}` : "/api/projects",
        {
          method: selectedProjectId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nextName,
            description: "Created from BabelTower MVP console",
          }),
        },
      );
      setProjects((current) => [response.project, ...current.filter((item) => item.id !== response.project.id)]);
      setSelectedProjectId(response.project.id);
      setProjectCode(response.project.code);
      setProjectName(response.project.name);
      message.success(
        selectedProjectId
          ? `项目已重命名：${response.project.name}。`
          : response.existed
            ? `已复用同名项目：${response.project.name}。`
            : `项目已创建：${response.project.name}，可以开始上传源文件。`,
      );
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function deleteProject() {
    if (!selectedProjectId) return;
    const matched = projects.find((project) => project.id === selectedProjectId);
    const label = matched?.name ?? projectName;
    if (!window.confirm(`确定删除项目「${label}」吗？该项目下的任务、快照、草稿和冲突记录也会被删除，字典数据不会删除。`)) {
      return;
    }

    setBusy("deleteProject");
    try {
      await requestJson<{ deleted: boolean }>(`/api/projects/${selectedProjectId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      setProjects((current) => current.filter((project) => project.id !== selectedProjectId));
      if (task?.projectId === selectedProjectId) {
        setTask(null);
        setRows([]);
        setRowEdits({});
        setInvalidRequiredFields({});
        setSnapshotVersion(0);
        setConflicts(emptyConflictSummary);
        writeCurrentTask(null);
      }
      setSelectedProjectId("");
      setProjectCode("");
      setProjectName("");
      message.success(`项目已删除：${label}。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function importTask() {
    if (!selectedProjectId) {
      message.error("请先创建或选择项目，TranslationTask 必须归属一个 ProductProject。");
      return;
    }
    if (!sourceFile) {
      message.error("请先选择源文件，支持 JSON、TS 和 .properties 文件。");
      return;
    }
    if (mode === "DUAL_SOURCE" && !targetFile) {
      message.error("双文件模式缺少目标文件，DUAL_SOURCE 需要同时上传英文目标文件。");
      return;
    }

    setBusy("importTask");
    try {
      const form = new FormData();
      form.append("projectId", selectedProjectId);
      form.append("name", taskName.trim() || sourceFile.name);
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
        dictionaryHits?: Record<string, string>;
      }>("/api/tasks", {
        method: "POST",
        body: form,
      });

      setTask(response.task);
      setRows(response.previewRows);
      setRowEdits({});
      setInvalidRequiredFields({});
      setSaveState("idle");
      setSnapshotVersion(response.latestSnapshot.version);
      setConflicts(response.conflictSummary);
      setDictionaryHits(response.dictionaryHits ?? {});
      setTasks((current) => [response.task, ...current.filter((item) => item.id !== response.task.id)]);
      if (response.conflictSummary.hasBlocking) {
        message.warning(`文件已解析为 Standard JSON，生成 ${response.previewRows.length} 行预览；blocking ${response.conflictSummary.blocking}，warning ${response.conflictSummary.warning}。`);
      } else {
        message.success(`文件已解析为 Standard JSON，生成 ${response.previewRows.length} 行预览；blocking ${response.conflictSummary.blocking}，warning ${response.conflictSummary.warning}。`);
      }
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  const flushDraftRows = useCallback(async (patches?: RowPatch[]) => {
    if (!task || !snapshotVersion) return true;
    const payloadRows = patches ?? Array.from(pendingPatches.current.values());
    if (payloadRows.length === 0) return true;

    setSaveState("saving");
    try {
      const response = await requestJson<{ currentVersion?: number; target?: "draft" | "official" }>(
        `/api/tasks/${task.id}/rows`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseVersion: snapshotVersion, rows: payloadRows }),
        },
      );
      for (const patch of payloadRows) pendingPatches.current.delete(patch.rowKey);
      if (response.currentVersion) setSnapshotVersion(response.currentVersion);
      setSaveState("saved");
      return true;
    } catch (error) {
      setSaveState("error");
      message.error(`实时保存失败：${formatError(error)}`);
      return false;
    }
  }, [message, snapshotVersion, task]);

  function rowsToPatches(sourceRows: PreviewRow[]): RowPatch[] {
    return sourceRows.map((row, rowIndex) => ({
      key: row.key,
      rowKey: row.key,
      rowIndex,
      keyPath: row.keyPath,
      sourceValue: row.sourceValue,
      translatedValue: row.translatedValue,
      status: row.status,
      conflictLevel: row.conflictLevel,
    }));
  }

  async function flushCurrentRows(sourceRows = mergedRows) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const saved = await flushDraftRows(rowsToPatches(sourceRows));
    if (!saved) throw new Error("当前编辑保存失败，已停止后续操作。");
    return sourceRows;
  }

  async function ensureCurrentPageSnapshot() {
    if (!task || !snapshotVersion) throw new Error("请先上传并解析任务。");
    const hasUncommittedEdits = pendingPatches.current.size > 0 || Object.keys(rowEdits).length > 0;
    if (!canEditDraft) return snapshotVersion;

    const currentRows = hasUncommittedEdits ? await flushCurrentRows(mergedRows) : mergedRows;
    const response = await requestJson<{ snapshot: Snapshot; task?: Task }>(`/api/tasks/${task.id}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseVersion: snapshotVersion }),
    });
    setSnapshotVersion(response.snapshot.version);
    if (response.task) setTask(response.task);
    setRows(currentRows);
    setRowEdits({});
    pendingPatches.current.clear();
    setSaveState("saved");
    return response.snapshot.version;
  }

  function scheduleDraftSave(patch: RowPatch) {
    pendingPatches.current.set(patch.rowKey, patch);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushDraftRows();
    }, 700);
  }

  function updateRow(index: number, field: "sourceValue" | "translatedValue", value: string) {
    const baseRow = mergedRows[index] ?? rows[index];
    if (!baseRow) return;
    const nextRow = { ...baseRow, [field]: value };
    if (value.trim()) {
      setInvalidRequiredFields((current) => {
        if (!current[baseRow.key]?.[field]) return current;
        const nextFieldState = { ...(current[baseRow.key] ?? {}), [field]: false };
        const next = { ...current, [baseRow.key]: nextFieldState };
        if (!nextFieldState.sourceValue && !nextFieldState.translatedValue) delete next[baseRow.key];
        return next;
      });
    }
    setRowEdits((current) => ({
      ...current,
      [baseRow.key]: {
        ...(current[baseRow.key] ?? {}),
        [field]: value,
      },
    }));
    scheduleDraftSave({
      key: nextRow.key,
      rowKey: nextRow.key,
      rowIndex: index,
      keyPath: nextRow.keyPath,
      sourceValue: nextRow.sourceValue,
      translatedValue: nextRow.translatedValue,
      status: nextRow.status,
      conflictLevel: nextRow.conflictLevel,
    });
  }

  async function saveDraft(kind: "auto" | "manual") {
    if (!task || !snapshotVersion) return;
    if (!canEditDraft) {
      message.warning("任务已保存或不可编辑，不能再创建暂存快照。");
      return;
    }
    setBusy(kind === "auto" ? "autosave" : "snapshot");
    try {
      if (kind === "auto") {
        const saved = await flushDraftRows(rowsToPatches(mergedRows));
        if (!saved) return;
        message.success("当前预览行已实时保存到暂存表。");
      } else {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        const saved = await flushDraftRows();
        if (!saved) return;
        const response = await requestJson<{ snapshot: Snapshot; task?: Task }>(`/api/tasks/${task.id}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseVersion: snapshotVersion }),
        });
        setSnapshotVersion(response.snapshot.version);
        if (response.task) setTask(response.task);
        setRows(mergedRows);
        setRowEdits({});
        pendingPatches.current.clear();
        message.success(`手动快照已创建，当前版本 v${response.snapshot.version}。`);
      }
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function validateCurrentTask() {
    if (!task || !snapshotVersion) return;
    if (!ensureNoEmptyPreviewValues("校验当前快照")) return;
    setBusy("validate");
    try {
      const version = await ensureCurrentPageSnapshot();
      const response = await requestJson<{
        valid: boolean;
        validationErrors: { field: string; message: string }[];
        unresolvedBlocking: number;
      }>(`/api/tasks/${task.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotVersion: version }),
      });
      if (response.valid) {
        message.success("校验通过，当前快照可以保存入库或导出。");
      } else {
        message.warning(`校验未通过，未解决 blocking：${response.unresolvedBlocking}；字段错误：${response.validationErrors.length}。`);
      }
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function saveToDictionary() {
    if (!task || !snapshotVersion) return;
    if (!ensureNoEmptyPreviewValues("同步 Dictionary")) return;
    setBusy("save");
    try {
      const version = await ensureCurrentPageSnapshot();
      const response = await apiFetch(`/api/tasks/${task.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotVersion: version }),
      });
      const body = await readBody(response);
      if (response.status === 409) {
        message.warning("保存前需要处理 blocking 冲突，API 已返回冲突列表；请先按冲突协议确认 KEEP_EXISTING / UPDATE_DICTIONARY 后再保存。");
        return;
      }
      if (!response.ok) throw new Error(getErrorMessage(body, response.status));
      const result = body as { task?: Task; dictionarySync?: { created: number; updated: number; skipped: number }; snapshot?: Snapshot };
      if (result.task) setTask(result.task);
      if (result.snapshot?.version) setSnapshotVersion(result.snapshot.version);
      setConflicts(emptyConflictSummary);
      setRowEdits({});
      pendingPatches.current.clear();
      setSaveState("saved");
      message.success(`已同步 Dictionary，新增 ${result.dictionarySync?.created ?? 0}，更新 ${result.dictionarySync?.updated ?? 0}，跳过 ${result.dictionarySync?.skipped ?? 0}。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function exportCurrentTask() {
    if (!task || !snapshotVersion) return;
    if (!ensureNoEmptyPreviewValues("生成导出文件")) return;
    setBusy("export");
    try {
      const version = await ensureCurrentPageSnapshot();
      const response = await apiFetch(`/api/tasks/${task.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotVersion: version, fileBaseName: task.name }),
      });
      const body = await readBody(response);
      const validationErrors = readValidationErrors(body);
      if (response.status === 422 && validationErrors.length > 0) {
        showExportValidationErrors(validationErrors);
        return;
      }
      if (!response.ok) throw new Error(getErrorMessage(body, response.status));
      const files = (body.files ?? {}) as Record<string, string>;
      downloadExportFiles(files);
      message.success(`已下载源文件和译文文件，共 ${Object.keys(files).length} 个文件。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  function downloadExportFiles(files: Record<string, string>) {
    for (const [filename, content] of Object.entries(files)) {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  }

  async function searchDictionary() {
    if (!dictionaryQuery.trim()) return;
    setBusy("dictionarySearch");
    try {
      const response = await requestJson<{ items: DictionaryEntry[] }>(
        `/api/dictionaries?q=${encodeURIComponent(dictionaryQuery.trim())}&limit=10`,
      );
      setDictionaryResults(response.items);
      message.info(`字典检索完成，匹配到 ${response.items.length} 条记录。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function createDictionaryEntry() {
    if (!dictionaryChinese.trim() || !dictionaryEnglish.trim()) {
      message.error("中文基准和英文译文都不能为空。");
      return;
    }
    setBusy("dictionaryCreate");
    try {
      const response = await apiFetch("/api/dictionaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chineseText: dictionaryChinese.trim(),
          englishText: dictionaryEnglish.trim(),
          resolution: "UPDATE_DICTIONARY",
          reason: "manual create from MVP console",
        }),
      });
      const body = await readBody(response);
      if (!response.ok) throw new Error(getErrorMessage(body, response.status));
      setDictionaryChinese("");
      setDictionaryEnglish("");
      message.success("字典项已写入，已按中文唯一索引写入或更新 Dictionary。");
      if (dictionaryQuery.trim()) void searchDictionary();
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  const isWorking = busy !== null;

  return (
    <main className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">BabelTower MVP Console</p>
            <h1>中文基准 i18n 业务工作台</h1>
            <p className="hero-copy">
              从文件导入开始，完成格式解析、标准结构、冲突检测、任务快照暂存、字典入库和导出闭环。
            </p>
          </div>
          <div className="hero-card">
            <span className="hero-card-label">当前任务</span>
            <strong>{task?.name ?? "等待导入"}</strong>
            <small>{task ? `${task.status} · v${snapshotVersion}` : "请先上传 JSON / TS / properties"}</small>
          </div>
        </header>

        <section className="pipeline" aria-label="Data pipeline">
          {pipeline.map((step, index) => (
            <div className="pipe-card" key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </section>

        <div className="grid two">
          <section className="panel" id="import">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Step 1</p>
                <h2>项目与文件导入</h2>
              </div>
            </div>

            <div className="form-grid project-grid">
              <label>
                项目
                <select value={selectedProjectId} onChange={(event) => {
                  const next = event.target.value;
                  setSelectedProjectId(next);
                  if (!next) {
                    setProjectCode("");
                    setProjectName("");
                  }
                }}>
                  <option value="">新建或选择项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                项目名称
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="例如 BabelTower Demo"
                />
              </label>
              <div className="project-actions">
                <button className="primary project-save" type="button" disabled={busy === "createProject"} onClick={saveProject}>
                  {busy === "createProject" ? "保存中..." : selectedProjectId ? "更新项目" : "保存项目"}
                </button>
                {selectedProjectId ? (
                  <button className="ghost danger project-delete" type="button" disabled={busy === "deleteProject"} onClick={deleteProject}>
                    {busy === "deleteProject" ? "删除中..." : "删除"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="import-card">
              <label>
                任务名称
                <input value={taskName} onChange={(event) => setTaskName(event.target.value)} />
              </label>
              <div className="segmented format-segmented">
                <button className={format === "json" ? "active" : ""} type="button" onClick={() => setFormat("json")}>
                  JSON
                </button>
                <button className={format === "properties" ? "active" : ""} type="button" onClick={() => setFormat("properties")}>
                  Properties
                </button>
                <button className={format === "ts" ? "active" : ""} type="button" onClick={() => setFormat("ts")}>
                  TS
                </button>
              </div>
              <div className="segmented">
                <button className={mode === "SINGLE_SOURCE" ? "active" : ""} type="button" onClick={() => setMode("SINGLE_SOURCE")}>
                  单文件
                </button>
                <button className={mode === "DUAL_SOURCE" ? "active" : ""} type="button" onClick={() => setMode("DUAL_SOURCE")}>
                  中英双文件
                </button>
              </div>
              <div className="file-grid">
                <label className="file-picker">
                  <input
                    type="file"
                    accept=".json,.ts,.properties"
                    onClick={(event) => {
                      event.currentTarget.value = "";
                    }}
                    onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                  />
                  <span>中文源文件</span>
                  <strong>{fileSizeLabel(sourceFile)}</strong>
                </label>
                <label className="file-picker">
                  <input
                    type="file"
                    accept=".json,.ts,.properties"
                    onClick={(event) => {
                      event.currentTarget.value = "";
                    }}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setTargetFile(file);
                      if (file) setMode("DUAL_SOURCE");
                    }}
                  />
                  <span>英文目标文件</span>
                  <strong>{fileSizeLabel(targetFile)}</strong>
                </label>
              </div>
              <button className="primary wide" type="button" disabled={busy === "importTask"} onClick={importTask}>
                {busy === "importTask" ? "解析中..." : "解析并生成预览"}
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Live status</p>
                <h2>主线闭环状态</h2>
              </div>
              <span className="pill">{progress}% translated</span>
            </div>
            <div className="metrics">
              <div>
                <span>预览行</span>
                <strong>{rows.length}</strong>
              </div>
              <div>
                <span>Blocking</span>
                <strong>{conflicts.blocking}</strong>
              </div>
              <div>
                <span>Warning</span>
                <strong>{conflicts.warning}</strong>
              </div>
              <div>
                <span>Info</span>
                <strong>{conflicts.info}</strong>
              </div>
            </div>
            <div className="task-list">
              <h3>最近任务</h3>
              {tasks.length === 0 ? (
                <p className="muted">暂无任务，导入文件后会出现在这里。</p>
              ) : (
                tasks.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="task-row"
                    onClick={() => {
                      setTask(item);
                      setSnapshotVersion(item.latestVersion);
                      message.info("已选中历史任务，当前页面只加载任务摘要；如需编辑，请重新导入或接入任务详情接口。");
                    }}
                  >
                    <span>{item.name}</span>
                    <small>{item.status} · v{item.latestVersion}</small>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="panel" id="preview">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Step 2</p>
              <h2>Standard JSON 预览与暂存</h2>
            </div>
          </div>
          {rows.length > 0 ? (
            <p className="virtual-note">
              展示 {virtualStart + 1}-{virtualEnd} / {rows.length} 行，实时保存写入暂存表。
            </p>
          ) : null}
          <div
            className="table-wrap preview-virtual"
            ref={tableWrapRef}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <table>
              <colgroup>
                <col className="col-key" />
                <col className="col-zh" />
                <col className="col-en" />
                <col className="col-dict" />
                <col className="col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th>Key Path</th>
                  <th>中文基准</th>
                  <th>英文译文</th>
                  <th>字典值</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      上传文件后会在这里展示可编辑预览行。
                    </td>
                  </tr>
                ) : (
                  <>
                    {topSpacerHeight > 0 ? (
                      <tr aria-hidden="true">
                        <td colSpan={5} style={{ height: topSpacerHeight, padding: 0, borderBottom: 0 }} />
                      </tr>
                    ) : null}
                    {visibleRows.map((row, visibleIndex) => {
                    const index = virtualStart + visibleIndex;
                    const sourceKey = (row.sourceValue ?? "").trim();
                    const dictionaryValue = sourceKey ? dictionaryHits[sourceKey] : undefined;
                    const statusBadge = row.conflictLevel
                      ? {
                          className: `status ${row.conflictLevel}`,
                          label: row.conflictLevel.toUpperCase(),
                        }
                      : {
                          className: `status ${row.status.toLowerCase()}`,
                          label: row.status,
                        };
                    return (
                      <tr key={`${row.key}-${index}`}>
                        <td>
                          <code>{row.keyPath.join(".")}</code>
                        </td>
                        <td>
                          <AutoSizeTextarea
                            className={invalidRequiredFields[row.key]?.sourceValue ? "field-invalid" : undefined}
                            value={row.sourceValue ?? ""}
                            onChange={(event) => updateRow(index, "sourceValue", event.target.value)}
                            aria-label={`${row.key} source`}
                            aria-invalid={invalidRequiredFields[row.key]?.sourceValue ? true : undefined}
                          />
                        </td>
                        <td>
                          <AutoSizeTextarea
                            className={invalidRequiredFields[row.key]?.translatedValue ? "field-invalid" : undefined}
                            value={row.translatedValue ?? ""}
                            onChange={(event) => updateRow(index, "translatedValue", event.target.value)}
                            placeholder="输入英文译文"
                            aria-label={`${row.key} translation`}
                            aria-invalid={invalidRequiredFields[row.key]?.translatedValue ? true : undefined}
                          />
                        </td>
                        <td className={dictionaryValue ? "dict-hit" : "dict-hit empty"}>
                          {dictionaryValue ?? "—"}
                        </td>
                        <td>
                          <span className={statusBadge.className}>{statusBadge.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                    {bottomSpacerHeight > 0 ? (
                      <tr aria-hidden="true">
                        <td colSpan={5} style={{ height: bottomSpacerHeight, padding: 0, borderBottom: 0 }} />
                      </tr>
                    ) : null}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div className="actions preview-actions">
            <span className={`save-state ${saveState}`}>
              {saveState === "saving" ? "实时保存中" : saveState === "saved" ? "已保存" : saveState === "error" ? "保存失败" : "暂存待命"}
            </span>
            <button className="ghost" type="button" disabled={!canEditDraft || isWorking} onClick={() => saveDraft("auto")}>
              {busy === "autosave" ? "暂存中..." : "立即暂存"}
            </button>
            <button className="ghost" type="button" disabled={!canEditDraft || isWorking} onClick={() => saveDraft("manual")}>
              {busy === "snapshot" ? "生成中..." : "手动快照"}
            </button>
          </div>
        </section>

        <div className="grid two">
          <section className="panel" id="conflicts">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Step 3</p>
                <h2>冲突检测与保存</h2>
              </div>
              <span className={conflicts.hasBlocking ? "pill danger" : "pill good"}>
                {conflicts.hasBlocking ? "需要确认" : "可保存"}
              </span>
            </div>
            <div className="conflict-board">
              <div>
                <span>中文一致但英文不同</span>
                <strong>{conflicts.blocking}</strong>
                <small>blocking</small>
              </div>
              <div>
                <span>中文相似度 ≥ 90%</span>
                <strong>{conflicts.warning}</strong>
                <small>warning</small>
              </div>
              <div>
                <span>完全重复</span>
                <strong>{conflicts.info}</strong>
                <small>info</small>
              </div>
            </div>
            <div className="actions stretch conflict-actions">
              {conflicts.blocking + conflicts.warning > 0 ? (
                <Link
                  className={`action-link ${conflicts.hasBlocking ? "primary danger" : "ghost"}`}
                  href="/conflicts"
                >
                  去解决冲突
                </Link>
              ) : (
                <button className="ghost" type="button" disabled>
                  去解决冲突
                </button>
              )}
              <button className="ghost" type="button" disabled={!task || isWorking} onClick={validateCurrentTask}>
                {busy === "validate" ? "校验中..." : "校验当前快照"}
              </button>
              <button className="primary" type="button" disabled={!task || isWorking} onClick={saveToDictionary}>
                {busy === "save" ? "同步中..." : "同步到 Dictionary"}
              </button>
            </div>
          </section>

          <section className="panel" id="dictionary">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Step 4</p>
                <h2>字典检索 / 手动写入</h2>
              </div>
            </div>
            <div className="search-line">
              <input value={dictionaryQuery} onChange={(event) => setDictionaryQuery(event.target.value)} placeholder="中文或英文关键字" />
              <button className="ghost" type="button" disabled={busy === "dictionarySearch"} onClick={searchDictionary}>
                检索
              </button>
            </div>
            <div className="dictionary-results">
              {dictionaryResults.length === 0 ? (
                <p className="muted">检索结果会展示 Dictionary 中文唯一索引下的译文。</p>
              ) : (
                dictionaryResults.map((entry) => (
                  <article key={entry.id}>
                    <strong>{entry.chineseText}</strong>
                    <span>{entry.englishText}</span>
                    <small>usage {entry.usageCount}</small>
                  </article>
                ))
              )}
            </div>
            <div className="form-grid manual-dict">
              <input value={dictionaryChinese} onChange={(event) => setDictionaryChinese(event.target.value)} placeholder="中文基准" />
              <input value={dictionaryEnglish} onChange={(event) => setDictionaryEnglish(event.target.value)} placeholder="英文译文" />
              <button className="primary" type="button" disabled={busy === "dictionaryCreate"} onClick={createDictionaryEntry}>
                写入字典
              </button>
            </div>
          </section>
        </div>

        <section className="panel" id="export">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Step 5</p>
              <h2>导出 JSON / TS / Properties</h2>
            </div>
            <button className="primary" type="button" disabled={!task || isWorking} onClick={exportCurrentTask}>
              {busy === "export" ? "导出中..." : "生成导出文件"}
            </button>
          </div>
          <div className="export-grid">
            <p className="muted">保存或校验后可导出回原格式；点击后会直接下载源文件和译文文件。</p>
          </div>
        </section>
    </main>
  );
}
