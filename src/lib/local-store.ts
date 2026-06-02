import { randomUUID } from "node:crypto";
import type {
  ConflictItem,
  ConflictSummary,
  PreviewRow,
  StandardI18nDocument,
} from "@/domain/standard-i18n/types";
import {
  chineseHash,
  dictionaryToStandardEntry,
  draftRowsToPreviewRows,
  normalizeText,
  previewRowToDraftData,
  type PreviewRowPatch,
} from "@/lib/standard";

export type ConflictSummaryCounts = {
  blocking: number;
  warning: number;
  info: number;
  hasBlocking: boolean;
};

type LocalProject = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currentTaskId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LocalTask = {
  id: string;
  projectId: string;
  name: string;
  mode: "SINGLE_SOURCE" | "DUAL_SOURCE";
  format: "JSON" | "PROPERTIES" | "TS";
  sourceLocale: string;
  targetLocale: string;
  status: "DRAFT" | "SAVED" | "READ_ONLY_HISTORY" | "CANCELLED";
  isEditable: boolean;
  latestVersion: number;
  sourceFilename: string | null;
  targetFilename: string | null;
  createdById: string | null;
  savedAt: Date | null;
  dictionarySyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SnapshotKind = "IMPORTED" | "AUTOSAVED" | "MANUAL_DRAFT" | "SAVED" | "EXPORTED";

type LocalSnapshot = {
  id: string;
  taskId: string;
  version: number;
  kind: SnapshotKind;
  standardDocuments: { source?: StandardI18nDocument; target?: StandardI18nDocument | null };
  previewRows: PreviewRow[];
  conflictSummary: ConflictSummaryCounts;
  validationErrors?: unknown;
  exportManifest?: unknown;
  createdById: string | null;
  createdAt: Date;
};

type LocalDictionary = {
  id: string;
  chineseText: string;
  chineseHash: string;
  normalizedChinese: string;
  englishText: string;
  normalizedEnglish: string;
  tags: string[];
  note: string | null;
  usageCount: number;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LocalConflict = {
  id: string;
  taskId: string | null;
  snapshotId: string | null;
  dictionaryId: string | null;
  type: "DUPLICATE_IDENTICAL" | "EXACT_CHINESE_DIFF_ENGLISH" | "SIMILAR_CHINESE";
  severity: "INFO" | "WARNING" | "BLOCKING";
  resolution: "UNRESOLVED" | "KEEP_EXISTING" | "UPDATE_DICTIONARY" | "IGNORE_SIMILAR" | "EDIT_ROW";
  candidateKey: string | null;
  candidateChineseText: string;
  candidateEnglishText: string | null;
  existingChineseText: string | null;
  existingEnglishText: string | null;
  similarity: number | null;
  reason: string;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

type LocalDraftRow = {
  id: string;
  taskId: string;
  rowKey: string;
  rowIndex: number;
  keyPath: string[];
  sourceValue: string | null;
  translatedValue: string | null;
  status: string;
  conflictLevel?: "blocking" | "warning" | "info" | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type LocalStore = {
  projects: LocalProject[];
  tasks: LocalTask[];
  snapshots: LocalSnapshot[];
  draftRows: LocalDraftRow[];
  dictionaries: LocalDictionary[];
  conflicts: LocalConflict[];
};

const globalForStore = globalThis as typeof globalThis & {
  __babelTowerLocalStore?: LocalStore;
};

function store() {
  if (!globalForStore.__babelTowerLocalStore) {
    globalForStore.__babelTowerLocalStore = {
      projects: [],
      tasks: [],
      snapshots: [],
      draftRows: [],
      dictionaries: [],
      conflicts: [],
    };
  }
  return globalForStore.__babelTowerLocalStore;
}

function now() {
  return new Date();
}

function sortByUpdatedAt<T extends { updatedAt: Date }>(items: T[]) {
  return [...items].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function isDatabaseUnavailable(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    ["P1001", "P1017", "P2021", "P2022", "P2024"].includes(code) ||
    message.includes("Can't reach database server") ||
    message.includes("Can't reach database") ||
    message.includes("ECONNREFUSED") ||
    message.includes("does not exist in the current database") ||
    message.includes("Cannot find module '.prisma/client")
  );
}

export function listLocalProjects(q: string | undefined, limit: number) {
  const needle = q ? q.toLowerCase() : "";
  const items = needle
    ? store().projects.filter(
        (project) =>
          project.code.toLowerCase().includes(needle) ||
          project.name.toLowerCase().includes(needle),
      )
    : store().projects;
  return sortByUpdatedAt(items).slice(0, limit);
}

export function findLocalProjectByName(name: string) {
  return store().projects.find((project) => project.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export function createLocalProject(data: {
  code: string;
  name: string;
  description?: string | null;
  createdById?: string | null;
}) {
  const state = store();
  const existing = state.projects.find((project) => project.name.toLowerCase() === data.name.toLowerCase());
  if (existing) {
    existing.description = data.description ?? existing.description;
    existing.updatedAt = now();
    return existing;
  }

  const project: LocalProject = {
    id: randomUUID(),
    code: data.code,
    name: data.name,
    description: data.description ?? null,
    currentTaskId: null,
    createdById: data.createdById ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  state.projects.unshift(project);
  return project;
}

export function updateLocalProject(projectId: string, data: { name: string; description?: string | null }) {
  const state = store();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return null;
  project.name = data.name;
  project.description = data.description ?? project.description;
  project.updatedAt = now();
  return project;
}

export function deleteLocalProject(projectId: string) {
  const state = store();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return null;
  const taskIds = new Set(state.tasks.filter((task) => task.projectId === projectId).map((task) => task.id));
  state.projects = state.projects.filter((item) => item.id !== projectId);
  state.tasks = state.tasks.filter((task) => task.projectId !== projectId);
  state.snapshots = state.snapshots.filter((snapshot) => !taskIds.has(snapshot.taskId));
  state.draftRows = state.draftRows.filter((row) => !taskIds.has(row.taskId));
  state.conflicts = state.conflicts.filter((conflict) => !conflict.taskId || !taskIds.has(conflict.taskId));
  return project;
}

export function listLocalTasks(args: {
  projectId?: string;
  status?: string;
  historyOnly?: boolean;
}) {
  const items = store().tasks.filter((task) => {
    if (args.projectId && task.projectId !== args.projectId) return false;
    if (args.status && task.status !== args.status) return false;
    if (!args.status && args.historyOnly && task.status !== "READ_ONLY_HISTORY") return false;
    return true;
  });
  return sortByUpdatedAt(items).map((task) => {
    const project = store().projects.find((item) => item.id === task.projectId);
    return {
      ...task,
      project: project ? { id: project.id, name: project.name } : null,
    };
  });
}

function localDictionaryEntries() {
  return store().dictionaries.map(dictionaryToStandardEntry);
}

function toConflictRows(
  taskId: string,
  snapshotId: string,
  summary: ConflictSummary,
): LocalConflict[] {
  const makeConflict = (
    item: ConflictItem,
    severity: LocalConflict["severity"],
    type: LocalConflict["type"],
  ): LocalConflict => ({
    id: randomUUID(),
    taskId,
    snapshotId,
    dictionaryId: null,
    type,
    severity,
    resolution: "UNRESOLVED",
    candidateKey: item.key,
    candidateChineseText: item.chineseValue,
    candidateEnglishText: item.newEnglish,
    existingChineseText: item.chineseValue,
    existingEnglishText: item.existingEnglish,
    similarity: item.similarity ?? null,
    reason:
      severity === "BLOCKING"
        ? "Chinese baseline matches but English differs."
        : severity === "WARNING"
          ? "Chinese baseline is over similarity threshold."
          : "Chinese and English are already identical.",
    resolvedById: null,
    resolvedAt: null,
    createdAt: now(),
  });

  return [
    ...summary.blocking.map((item) => makeConflict(item, "BLOCKING", "EXACT_CHINESE_DIFF_ENGLISH")),
    ...summary.warning.map((item) => makeConflict(item, "WARNING", "SIMILAR_CHINESE")),
    ...summary.info.map((item) => makeConflict(item, "INFO", "DUPLICATE_IDENTICAL")),
  ];
}

export function createLocalImportTask(args: {
  projectId: string;
  name: string;
  mode: "SINGLE_SOURCE" | "DUAL_SOURCE";
  format: "JSON" | "PROPERTIES" | "TS";
  sourceLocale: string;
  targetLocale: string;
  sourceFilename: string;
  targetFilename?: string | null;
  document: StandardI18nDocument;
  targetDocument?: StandardI18nDocument;
  previewRows: PreviewRow[];
  conflictSummary: ConflictSummary;
  summary: ConflictSummaryCounts;
}) {
  const state = store();
  const project = state.projects.find((item) => item.id === args.projectId);
  if (!project) throw new Error("project not found");

  const task: LocalTask = {
    id: randomUUID(),
    projectId: args.projectId,
    name: args.name,
    mode: args.mode,
    format: args.format,
    sourceLocale: args.sourceLocale,
    targetLocale: args.targetLocale,
    status: "DRAFT",
    isEditable: true,
    latestVersion: 1,
    sourceFilename: args.sourceFilename,
    targetFilename: args.targetFilename ?? null,
    createdById: null,
    savedAt: null,
    dictionarySyncedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };

  const snapshot: LocalSnapshot = {
    id: randomUUID(),
    taskId: task.id,
    version: 1,
    kind: "IMPORTED",
    standardDocuments: { source: args.document, target: args.targetDocument ?? null },
    previewRows: args.previewRows,
    conflictSummary: args.summary,
    createdById: null,
    createdAt: now(),
  };

  state.tasks.unshift(task);
  state.snapshots.unshift(snapshot);
  state.draftRows.push(
    ...args.previewRows.map((row, rowIndex) => ({
      id: randomUUID(),
      taskId: task.id,
      ...previewRowToDraftData(row, rowIndex),
      createdAt: now(),
      updatedAt: now(),
    })),
  );
  state.conflicts.push(...toConflictRows(task.id, snapshot.id, args.conflictSummary));
  project.currentTaskId = task.id;
  project.updatedAt = now();

  return { task, latestSnapshot: snapshot };
}

export function getLocalTask(taskId: string) {
  return store().tasks.find((task) => task.id === taskId) ?? null;
}

export function getLatestLocalSnapshot(taskId: string) {
  const snapshots = store().snapshots.filter((snapshot) => snapshot.taskId === taskId);
  return snapshots.sort((a, b) => b.version - a.version)[0] ?? null;
}

export function listLocalSnapshots(taskId: string) {
  return store()
    .snapshots.filter((snapshot) => snapshot.taskId === taskId)
    .sort((a, b) => b.version - a.version);
}

export function getLocalSnapshot(taskId: string, version: number) {
  return (
    store().snapshots.find((snapshot) => snapshot.taskId === taskId && snapshot.version === version) ??
    null
  );
}

export function listLocalDraftRows(taskId: string) {
  return store().draftRows
    .filter((row) => row.taskId === taskId)
    .sort((a, b) => a.rowIndex - b.rowIndex);
}

export function getLocalCurrentRows(taskId: string) {
  const draftRows = listLocalDraftRows(taskId);
  if (draftRows.length > 0) return draftRowsToPreviewRows(draftRows);
  return getLatestLocalSnapshot(taskId)?.previewRows ?? [];
}

export function initializeLocalDraftRowsFromSnapshot(taskId: string) {
  const state = store();
  if (state.draftRows.some((row) => row.taskId === taskId)) return listLocalDraftRows(taskId);
  const snapshot = getLatestLocalSnapshot(taskId);
  if (!snapshot) return [];
  state.draftRows.push(
    ...snapshot.previewRows.map((row, rowIndex) => ({
      id: randomUUID(),
      taskId,
      ...previewRowToDraftData(row, rowIndex),
      createdAt: now(),
      updatedAt: now(),
    })),
  );
  return listLocalDraftRows(taskId);
}

export function upsertLocalDraftRows(taskId: string, rows: PreviewRowPatch[]) {
  const state = store();
  const task = getLocalTask(taskId);
  if (!task) throw new Error("task not found");
  if (task.status !== "DRAFT" || !task.isEditable) {
    throw new Error("task is not draft editable");
  }

  for (const patch of rows) {
    const rowKey = (patch.rowKey ?? patch.key ?? "").trim();
    if (!rowKey) continue;
    const existing = state.draftRows.find((row) => row.taskId === taskId && row.rowKey === rowKey);
    if (existing) {
      if (typeof patch.rowIndex === "number") existing.rowIndex = patch.rowIndex;
      if (Array.isArray(patch.keyPath)) existing.keyPath = patch.keyPath;
      if ("sourceValue" in patch) existing.sourceValue = patch.sourceValue ?? null;
      if ("translatedValue" in patch) existing.translatedValue = patch.translatedValue ?? null;
      if (typeof patch.status === "string") existing.status = patch.status;
      if ("conflictLevel" in patch) existing.conflictLevel = patch.conflictLevel ?? null;
      existing.updatedAt = now();
    } else {
      state.draftRows.push({
        id: randomUUID(),
        taskId,
        rowKey,
        rowIndex: patch.rowIndex ?? state.draftRows.filter((row) => row.taskId === taskId).length,
        keyPath: patch.keyPath ?? [rowKey],
        sourceValue: patch.sourceValue ?? null,
        translatedValue: patch.translatedValue ?? null,
        status: patch.status ?? "NORMAL",
        conflictLevel: patch.conflictLevel ?? null,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }
  task.updatedAt = now();
  return listLocalDraftRows(taskId);
}

export function deleteLocalDraftRows(taskId: string) {
  const state = store();
  state.draftRows = state.draftRows.filter((row) => row.taskId !== taskId);
}

export function createLocalSnapshot(args: {
  taskId: string;
  baseVersion: number;
  rows?: PreviewRow[];
  kind: "AUTOSAVED" | "MANUAL_DRAFT" | "SAVED";
}) {
  const state = store();
  const task = state.tasks.find((item) => item.id === args.taskId);
  if (!task) throw new Error("task not found");
  if (task.status !== "DRAFT" || !task.isEditable) {
    throw new Error("task is not draft editable");
  }
  if (task.latestVersion !== args.baseVersion) {
    const error = new Error("snapshot version conflict");
    (error as Error & { expected?: number; actual?: number }).expected = task.latestVersion;
    (error as Error & { expected?: number; actual?: number }).actual = args.baseVersion;
    throw error;
  }

  const latest = getLatestLocalSnapshot(args.taskId);
  const snapshot: LocalSnapshot = {
    id: randomUUID(),
    taskId: args.taskId,
    version: args.baseVersion + 1,
    kind: args.kind,
    standardDocuments: latest?.standardDocuments ?? {},
    previewRows: args.rows ?? getLocalCurrentRows(args.taskId),
    conflictSummary: latest?.conflictSummary ?? { blocking: 0, warning: 0, info: 0, hasBlocking: false },
    createdById: null,
    createdAt: now(),
  };
  task.latestVersion = snapshot.version;
  if (args.kind === "SAVED") {
    task.status = "SAVED";
    task.isEditable = false;
    task.savedAt = now();
    deleteLocalDraftRows(args.taskId);
  }
  task.updatedAt = now();
  state.snapshots.unshift(snapshot);
  return { snapshot, task };
}

export function resolveLocalConflicts(
  taskId: string,
  resolutions: { key: string; resolution: string }[],
) {
  const allowed: LocalConflict["resolution"][] = [
    "KEEP_EXISTING",
    "UPDATE_DICTIONARY",
    "IGNORE_SIMILAR",
    "EDIT_ROW",
  ];
  const resolvedAt = now();
  for (const item of resolutions) {
    const resolution = allowed.includes(item.resolution as LocalConflict["resolution"])
      ? (item.resolution as LocalConflict["resolution"])
      : "EDIT_ROW";
    for (const conflict of store().conflicts) {
      if (
        conflict.taskId === taskId &&
        conflict.candidateKey === item.key &&
        conflict.resolvedAt === null
      ) {
        conflict.resolvedAt = resolvedAt;
        conflict.resolution = resolution;
      }
    }
  }
}

export function summarizeLocalConflictCounts(taskId: string): ConflictSummaryCounts {
  const unresolved = store().conflicts.filter(
    (conflict) => conflict.taskId === taskId && conflict.resolvedAt === null,
  );
  const blocking = unresolved.filter((conflict) => conflict.severity === "BLOCKING").length;
  const warning = unresolved.filter((conflict) => conflict.severity === "WARNING").length;
  const info = unresolved.filter((conflict) => conflict.severity === "INFO").length;
  return { blocking, warning, info, hasBlocking: blocking > 0 };
}

export function updateLocalSnapshotConflictSummary(
  taskId: string,
  version: number,
  conflictSummary: ConflictSummaryCounts,
) {
  const snapshot = store().snapshots.find(
    (item) => item.taskId === taskId && item.version === version,
  );
  if (!snapshot) return null;
  snapshot.conflictSummary = conflictSummary;
  return snapshot;
}

export function countUnresolvedBlocking(taskId: string) {
  return store().conflicts.filter(
    (conflict) =>
      conflict.taskId === taskId &&
      conflict.severity === "BLOCKING" &&
      conflict.resolvedAt === null,
  ).length;
}

export function unresolvedBlockingConflicts(taskId: string) {
  return store().conflicts.filter(
    (conflict) =>
      conflict.taskId === taskId &&
      conflict.severity === "BLOCKING" &&
      conflict.resolvedAt === null,
  );
}

export function listLocalTaskConflicts(taskId: string, unresolvedOnly = false) {
  return store()
    .conflicts
    .filter((conflict) => conflict.taskId === taskId && (!unresolvedOnly || conflict.resolvedAt === null))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function listLocalDictionaries(args: {
  query?: string;
  field?: string;
  limit: number;
}) {
  const normalized = normalizeText(args.query ?? "").toLowerCase();
  const items = store().dictionaries.filter((entry) => {
    if (!normalized) return true;
    if (args.field === "chinese") return entry.normalizedChinese.toLowerCase().includes(normalized);
    if (args.field === "english") return entry.normalizedEnglish.toLowerCase().includes(normalized);
    return (
      entry.normalizedChinese.toLowerCase().includes(normalized) ||
      entry.normalizedEnglish.toLowerCase().includes(normalized)
    );
  });
  return sortByUpdatedAt(items).slice(0, args.limit);
}

export function upsertLocalDictionary(data: {
  chineseText: string;
  englishText: string;
  tags?: string[];
  note?: string | null;
  usageIncrement?: number;
}) {
  const state = store();
  const hash = chineseHash(data.chineseText);
  const existing = state.dictionaries.find((entry) => entry.chineseHash === hash);
  if (existing) {
    existing.englishText = data.englishText;
    existing.normalizedEnglish = normalizeText(data.englishText);
    existing.tags = data.tags ?? existing.tags;
    existing.note = data.note ?? existing.note;
    existing.usageCount += data.usageIncrement ?? 0;
    existing.updatedAt = now();
    return { entry: existing, existed: true };
  }

  const entry: LocalDictionary = {
    id: randomUUID(),
    chineseText: data.chineseText,
    chineseHash: hash,
    normalizedChinese: normalizeText(data.chineseText),
    englishText: data.englishText,
    normalizedEnglish: normalizeText(data.englishText),
    tags: data.tags ?? [],
    note: data.note ?? null,
    usageCount: data.usageIncrement ?? 0,
    createdById: null,
    updatedById: null,
    createdAt: now(),
    updatedAt: now(),
  };
  state.dictionaries.unshift(entry);
  return { entry, existed: false };
}

export function findLocalDictionaryByChineseHash(hash: string) {
  return store().dictionaries.find((entry) => entry.chineseHash === hash) ?? null;
}

export function saveLocalTaskToDictionary(taskId: string, snapshotVersion: number) {
  const state = store();
  const snapshot = getLocalSnapshot(taskId, snapshotVersion);
  const task = getLocalTask(taskId);
  if (!task || !snapshot) throw new Error("snapshot not found");
  const rows = snapshot.previewRows;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const seenHashes = new Set<string>();
  for (const row of rows) {
    const chineseText = row.sourceValue?.trim();
    const englishText = row.translatedValue?.trim();
    if (!chineseText || !englishText) {
      skipped++;
      continue;
    }
    const hash = chineseHash(chineseText);
    if (seenHashes.has(hash)) {
      skipped++;
      continue;
    }
    seenHashes.add(hash);

    const existing = findLocalDictionaryByChineseHash(hash);
    if (!existing) {
      upsertLocalDictionary({ chineseText, englishText, usageIncrement: 1 });
      created++;
      continue;
    }
    if (normalizeText(existing.englishText) === normalizeText(englishText)) {
      skipped++;
      continue;
    }
    upsertLocalDictionary({ chineseText, englishText, usageIncrement: 1 });
    updated++;
  }

  for (const conflict of state.conflicts) {
    if (conflict.taskId === taskId && conflict.resolvedAt === null) {
      conflict.resolvedAt = now();
      conflict.resolution = "UPDATE_DICTIONARY";
    }
  }

  task.dictionarySyncedAt = now();
  task.updatedAt = now();

  return {
    task,
    snapshot,
    dictionarySync: { created, updated, skipped },
  };
}

export function getLocalDictionaryEntriesForConflict() {
  return localDictionaryEntries();
}

export function getLocalCurrentTask(projectId: string) {
  const state = store();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return null;
  if (project.currentTaskId) return getLocalTask(project.currentTaskId);
  return sortByUpdatedAt(state.tasks.filter((task) => task.projectId === projectId && task.status === "DRAFT" && task.isEditable))[0] ?? null;
}

export function clearLocalStore() {
  globalForStore.__babelTowerLocalStore = {
    projects: [],
    tasks: [],
    snapshots: [],
    draftRows: [],
    dictionaries: [],
    conflicts: [],
  };
  return globalForStore.__babelTowerLocalStore;
}

export function clearLocalDictionaries() {
  const state = store();
  const counts = {
    dictionaries: state.dictionaries.length,
    dictionaryRevisions: 0,
    dictionaryConflictsUpdated: state.conflicts.filter((conflict) => conflict.dictionaryId !== null).length,
  };
  state.dictionaries = [];
  state.conflicts = state.conflicts.map((conflict) => ({
    ...conflict,
    dictionaryId: null,
  }));
  return counts;
}

export function clearLocalSnapshots() {
  const state = store();
  const snapshotIds = new Set(state.snapshots.map((snapshot) => snapshot.id));
  const counts = {
    snapshots: state.snapshots.length,
    snapshotConflicts: state.conflicts.filter(
      (conflict) => conflict.snapshotId !== null && snapshotIds.has(conflict.snapshotId),
    ).length,
  };
  state.snapshots = [];
  state.conflicts = state.conflicts.filter(
    (conflict) => conflict.snapshotId === null || !snapshotIds.has(conflict.snapshotId),
  );
  return counts;
}

export function resetLocalSnapshotsAndDictionaries() {
  const snapshotCounts = clearLocalSnapshots();
  const dictionaryCounts = clearLocalDictionaries();
  return {
    ...snapshotCounts,
    ...dictionaryCounts,
  };
}

export function clearLocalProjects() {
  const state = store();
  const taskIds = new Set(state.tasks.map((task) => task.id));
  const counts = {
    projects: state.projects.length,
    tasks: state.tasks.length,
    draftRows: state.draftRows.filter((row) => taskIds.has(row.taskId)).length,
    projectConflicts: state.conflicts.filter(
      (conflict) => conflict.taskId !== null && taskIds.has(conflict.taskId),
    ).length,
  };
  state.projects = [];
  state.tasks = [];
  state.draftRows = [];
  state.snapshots = state.snapshots.filter((snapshot) => !taskIds.has(snapshot.taskId));
  state.conflicts = state.conflicts.filter((conflict) => !conflict.taskId || !taskIds.has(conflict.taskId));
  return counts;
}
