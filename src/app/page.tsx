"use client";

import { useEffect, useMemo, useState } from "react";
import { writeCurrentTask } from "@/lib/current-task";
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
  name: string;
  status: string;
  mode: string;
  format: string;
  latestVersion: number;
  sourceFilename?: string | null;
  targetFilename?: string | null;
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


const emptyConflictSummary: ConflictSummary = {
  blocking: 0,
  warning: 0,
  info: 0,
  hasBlocking: false,
};

const pipeline = [
  "Input(File)",
  "Parser",
  "Standard JSON",
  "Conflict Check",
  "Database",
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
  if (!file) return "未选择文件";
  if (file.size < 1024) return `${file.name} · ${file.size} B`;
  if (file.size < 1024 * 1024) return `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  return `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
}

function nowCode() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `BT-${stamp}`;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectName, setProjectName] = useState("BabelTower Demo");
  const [projectCode, setProjectCode] = useState(nowCode);
  const [taskName, setTaskName] = useState("首次导入任务");
  const [format, setFormat] = useState<"json" | "properties">("json");
  const [mode, setMode] = useState<"SINGLE_SOURCE" | "DUAL_SOURCE">("SINGLE_SOURCE");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [conflicts, setConflicts] = useState<ConflictSummary>(emptyConflictSummary);
  const [dictionaryQuery, setDictionaryQuery] = useState("确认");
  const [dictionaryResults, setDictionaryResults] = useState<DictionaryEntry[]>([]);
  const [dictionaryChinese, setDictionaryChinese] = useState("");
  const [dictionaryEnglish, setDictionaryEnglish] = useState("");
  const [exportFiles, setExportFiles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const message = useMessage();

  const completedRows = useMemo(
    () => rows.filter((row) => row.translatedValue && row.translatedValue.trim().length > 0).length,
    [rows],
  );
  const progress = rows.length ? Math.round((completedRows / rows.length) * 100) : 0;

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const response = await requestJson<{ items: Project[] }>("/api/projects?limit=20");
        if (!cancelled) {
          setProjects(response.items);
          setSelectedProjectId((current) => current || response.items[0]?.id || "");
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
  }, []);

  useEffect(() => {
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
  }, [selectedProjectId]);

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
      message.error("项目 code 和 name 都不能为空。");
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
          description: "Created from BabelTower MVP console",
        }),
      });
      setProjects((current) => [response.project, ...current]);
      setSelectedProjectId(response.project.id);
      message.success(`项目已创建：${response.project.name}，可以开始上传源文件。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  function loadSampleFile() {
    const sample = JSON.stringify(
      {
        common: {
          confirm: "确认",
          cancel: "取消",
          save: "保存",
        },
        billing: {
          title: "账单中心",
          overdue: "当前账单已逾期",
        },
      },
      null,
      2,
    );
    setSourceFile(new File([sample], "babeltower.sample.zh-CN.json", { type: "application/json" }));
    setTargetFile(null);
    setFormat("json");
    setMode("SINGLE_SOURCE");
    setTaskName("示例 JSON 导入");
    message.info("示例文件已载入，点击“解析并生成预览”即可走真实 API 流程。");
  }

  async function importTask() {
    if (!selectedProjectId) {
      message.error("请先创建或选择项目，TranslationTask 必须归属一个 ProductProject。");
      return;
    }
    if (!sourceFile) {
      message.error("请先选择源文件，支持 JSON 和 .properties 文件。");
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
      }>("/api/tasks", {
        method: "POST",
        body: form,
      });

      setTask(response.task);
      setRows(response.previewRows);
      setSnapshotVersion(response.latestSnapshot.version);
      setConflicts(response.conflictSummary);
      setExportFiles({});
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

  function updateRow(index: number, field: "sourceValue" | "translatedValue", value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    );
  }

  async function saveDraft(kind: "auto" | "manual") {
    if (!task || !snapshotVersion) return;
    setBusy(kind === "auto" ? "autosave" : "snapshot");
    try {
      const endpoint = kind === "auto" ? "rows" : "snapshot";
      const payload =
        kind === "auto"
          ? { baseVersion: snapshotVersion, rows }
          : { baseVersion: snapshotVersion, previewRows: rows };
      const response = await requestJson<{ snapshot: Snapshot }>(`/api/tasks/${task.id}/${endpoint}`, {
        method: kind === "auto" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSnapshotVersion(response.snapshot.version);
      message.success(kind === "auto" ? `预览行已暂存，当前版本 v${response.snapshot.version}。` : `手动快照已创建，当前版本 v${response.snapshot.version}。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function validateCurrentTask() {
    if (!task || !snapshotVersion) return;
    setBusy("validate");
    try {
      const response = await requestJson<{
        valid: boolean;
        validationErrors: { field: string; message: string }[];
        unresolvedBlocking: number;
      }>(`/api/tasks/${task.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotVersion }),
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
    setBusy("save");
    try {
      const response = await fetch(`/api/tasks/${task.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotVersion }),
      });
      const body = await readBody(response);
      if (response.status === 409) {
        message.warning("保存前需要处理 blocking 冲突，API 已返回冲突列表；请先按冲突协议确认 KEEP_EXISTING / UPDATE_DICTIONARY 后再保存。");
        return;
      }
      if (!response.ok) throw new Error(getErrorMessage(body, response.status));
      const result = body as { dictionarySync?: { created: number; updated: number; skipped: number }; snapshot?: Snapshot };
      if (result.snapshot?.version) setSnapshotVersion(result.snapshot.version);
      message.success(`已保存入库，新增 ${result.dictionarySync?.created ?? 0}，更新 ${result.dictionarySync?.updated ?? 0}，跳过 ${result.dictionarySync?.skipped ?? 0}。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  async function exportCurrentTask() {
    if (!task || !snapshotVersion) return;
    setBusy("export");
    try {
      const response = await fetch(`/api/tasks/${task.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotVersion, fileBaseName: task.name }),
      });
      const body = await readBody(response);
      if (!response.ok) throw new Error(getErrorMessage(body, response.status));
      const files = (body.files ?? {}) as Record<string, string>;
      setExportFiles(files);
      message.success(`导出已生成 ${Object.keys(files).length} 个文件，可在页面右侧下载或复制。`);
    } catch (error) {
      message.error(formatError(error));
    } finally {
      setBusy(null);
    }
  }

  function downloadExportFile(filename: string, content: string) {
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
      const response = await fetch("/api/dictionaries", {
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
              从文件导入开始，完成 Parser、Standard JSON、冲突检测、TaskSnapshot 暂存、Dictionary 入库和导出闭环。
            </p>
          </div>
          <div className="hero-card">
            <span className="hero-card-label">当前任务</span>
            <strong>{task?.name ?? "等待导入"}</strong>
            <small>{task ? `${task.status} · v${snapshotVersion}` : "请先上传 JSON / properties"}</small>
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
              <button className="ghost" type="button" onClick={loadSampleFile}>
                载入示例文件
              </button>
            </div>

            <div className="form-grid">
              <label>
                项目
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  <option value="">新建或选择项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} · {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                新项目 Code
                <input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} />
              </label>
              <label>
                新项目名称
                <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
              </label>
              <button className="primary align-end" type="button" disabled={busy === "createProject"} onClick={createProject}>
                {busy === "createProject" ? "创建中..." : "创建项目"}
              </button>
            </div>

            <div className="import-card">
              <label>
                任务名称
                <input value={taskName} onChange={(event) => setTaskName(event.target.value)} />
              </label>
              <div className="segmented">
                <button className={format === "json" ? "active" : ""} type="button" onClick={() => setFormat("json")}>
                  JSON
                </button>
                <button className={format === "properties" ? "active" : ""} type="button" onClick={() => setFormat("properties")}>
                  Properties
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
                    accept=".json,.properties"
                    onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                  />
                  <span>中文源文件</span>
                  <strong>{fileSizeLabel(sourceFile)}</strong>
                </label>
                <label className="file-picker">
                  <input
                    type="file"
                    accept=".json,.properties"
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
            <div className="actions">
              <button className="ghost" type="button" disabled={!task || isWorking} onClick={() => saveDraft("auto")}>
                {busy === "autosave" ? "暂存中..." : "自动暂存"}
              </button>
              <button className="ghost" type="button" disabled={!task || isWorking} onClick={() => saveDraft("manual")}>
                {busy === "snapshot" ? "生成中..." : "手动快照"}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key Path</th>
                  <th>中文基准</th>
                  <th>英文译文</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      上传文件后会在这里展示可编辑预览行。
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={`${row.key}-${index}`}>
                      <td>
                        <code>{row.keyPath.join(".")}</code>
                      </td>
                      <td>
                        <textarea
                          value={row.sourceValue ?? ""}
                          onChange={(event) => updateRow(index, "sourceValue", event.target.value)}
                          aria-label={`${row.key} source`}
                        />
                      </td>
                      <td>
                        <textarea
                          value={row.translatedValue ?? ""}
                          onChange={(event) => updateRow(index, "translatedValue", event.target.value)}
                          placeholder="输入英文译文"
                          aria-label={`${row.key} translation`}
                        />
                      </td>
                      <td>
                        <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
            <div className="actions stretch">
              <button className="ghost" type="button" disabled={!task || isWorking} onClick={validateCurrentTask}>
                {busy === "validate" ? "校验中..." : "校验当前快照"}
              </button>
              <button className="primary" type="button" disabled={!task || isWorking} onClick={saveToDictionary}>
                {busy === "save" ? "保存中..." : "保存入 Dictionary"}
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
              <h2>导出 JSON / Properties</h2>
            </div>
            <button className="primary" type="button" disabled={!task || isWorking} onClick={exportCurrentTask}>
              {busy === "export" ? "导出中..." : "生成导出文件"}
            </button>
          </div>
          <div className="export-grid">
            {Object.keys(exportFiles).length === 0 ? (
              <p className="muted">保存或校验后可导出回原格式；当前 API 会按源格式生成文件内容。</p>
            ) : (
              Object.entries(exportFiles).map(([filename, content]) => (
                <article className="export-file" key={filename}>
                  <div>
                    <strong>{filename}</strong>
                    <small>{content.length.toLocaleString()} chars</small>
                  </div>
                  <pre>{content.slice(0, 800)}</pre>
                  <button className="ghost" type="button" onClick={() => downloadExportFile(filename, content)}>
                    下载
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
    </main>
  );
}
