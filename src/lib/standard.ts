import { createHash } from "node:crypto";
import { parseJson } from "@/domain/parser/json-parser";
import { parseProperties } from "@/domain/parser/properties-parser";
import { parseTs } from "@/domain/parser/ts-parser";
import type {
  ConflictLevel,
  EntryStatus,
  ConflictSummary,
  PreviewRow,
  SourceFormat,
  StandardI18nDocument,
  StandardI18nEntry,
} from "@/domain/standard-i18n/types";

export function normalizeText(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function chineseHash(chineseText: string) {
  return createHash("sha256").update(normalizeText(chineseText)).digest("hex");
}

export function detectSourceFormat(fileName: string, explicit?: string | null): SourceFormat {
  const value = (explicit ?? "").toLowerCase();
  if (value === "json" || value === "properties" || value === "ts") return value;
  if (fileName.toLowerCase().endsWith(".ts")) return "ts";
  if (fileName.toLowerCase().endsWith(".properties")) return "properties";
  return "json";
}

export function parseI18nDocument(args: {
  content: string;
  fileName: string;
  format?: string | null;
  locale?: string | null;
}) {
  const sourceFormat = detectSourceFormat(args.fileName, args.format);
  const locale = args.locale ?? "zh-CN";
  if (sourceFormat === "properties") {
    return parseProperties(args.content, { locale, sourceName: args.fileName });
  }
  if (sourceFormat === "ts") {
    return parseTs(args.content, { locale, sourceName: args.fileName });
  }
  return parseJson(args.content, { locale, sourceName: args.fileName });
}

export function mergeTargetDocument(
  sourceDocument: StandardI18nDocument,
  targetDocument?: StandardI18nDocument,
): StandardI18nDocument {
  if (!targetDocument) return sourceDocument;

  const targetByKey = new Map(targetDocument.entries.map((entry) => [entry.key, entry]));
  return {
    ...sourceDocument,
    entries: sourceDocument.entries.map((entry) => {
      const target = targetByKey.get(entry.key);
      return target
        ? { ...entry, translatedValue: target.sourceValue ?? target.translatedValue }
        : entry;
    }),
  };
}

export function buildPreviewRows(document: StandardI18nDocument): PreviewRow[] {
  return document.entries.map((entry) => ({
    key: entry.key,
    keyPath: entry.keyPath,
    sourceValue: entry.sourceValue,
    translatedValue: entry.translatedValue,
    status: entry.status,
  }));
}

/**
 * Merge dictionary-conflict severities back into preview rows so the UI can
 * surface BLOCKING / WARNING / INFO on the per-row STATUS column. Without
 * this every imported row stays "NORMAL" even when the summary card reports
 * dozens of conflicts.
 */
export function annotateConflictLevels(
  rows: PreviewRow[],
  summary: ConflictSummary,
): PreviewRow[] {
  const severityByKey = new Map<string, ConflictLevel>();
  for (const item of summary.blocking) {
    severityByKey.set(item.key, "blocking");
  }
  for (const item of summary.warning) {
    if (!severityByKey.has(item.key)) {
      severityByKey.set(item.key, "warning");
    }
  }
  for (const item of summary.info) {
    if (!severityByKey.has(item.key)) {
      severityByKey.set(item.key, "info");
    }
  }
  if (severityByKey.size === 0) return rows;
  return rows.map((row) => {
    const level = severityByKey.get(row.key);
    if (!level) {
      if (row.conflictLevel) {
        const { conflictLevel: _ignored, ...rest } = row;
        return rest;
      }
      return row;
    }
    return { ...row, conflictLevel: level };
  });
}

export function summarizeConflicts(summary: ConflictSummary) {
  return {
    blocking: summary.blocking.length,
    warning: summary.warning.length,
    info: summary.info.length,
    hasBlocking: summary.hasBlocking,
  };
}

export function dictionaryToStandardEntry(entry: {
  id: string;
  chineseText: string;
  englishText: string;
}) : StandardI18nEntry {
  return {
    key: entry.id,
    keyPath: [entry.id],
    sourceValue: entry.chineseText,
    translatedValue: entry.englishText,
    locale: "en-US",
    status: "NORMAL",
  };
}

export function rowsToDocument(
  rows: PreviewRow[],
  base: StandardI18nDocument,
): StandardI18nDocument {
  const baseEntryByKey = new Map(base.entries.map((entry) => [entry.key, entry]));
  return {
    ...base,
    entries: rows.map((row) => ({
      ...(baseEntryByKey.get(row.key) ?? {}),
      key: row.key,
      keyPath: row.keyPath,
      sourceValue: row.sourceValue,
      translatedValue: row.translatedValue,
      locale: base.locale,
      status: row.status,
    })),
  };
}

export type DraftRowLike = {
  rowKey: string;
  rowIndex: number;
  keyPath: unknown;
  sourceValue: string | null;
  translatedValue: string | null;
  status: string;
  conflictLevel?: string | null;
};

export type PreviewRowPatch = {
  key?: string;
  rowKey?: string;
  rowIndex?: number;
  keyPath?: string[];
  sourceValue?: string | null;
  translatedValue?: string | null;
  status?: string;
  conflictLevel?: ConflictLevel | null;
};

export function previewRowToDraftData(row: PreviewRow, rowIndex: number) {
  return {
    rowKey: row.key,
    rowIndex,
    keyPath: row.keyPath,
    sourceValue: row.sourceValue ?? null,
    translatedValue: row.translatedValue ?? null,
    status: row.status,
    conflictLevel: row.conflictLevel ?? null,
  };
}

export function draftRowToPreviewRow(row: DraftRowLike): PreviewRow {
  const keyPath = Array.isArray(row.keyPath)
    ? row.keyPath.filter((item): item is string => typeof item === "string")
    : [row.rowKey];
  return {
    key: row.rowKey,
    keyPath,
    sourceValue: row.sourceValue,
    translatedValue: row.translatedValue,
    status: row.status as EntryStatus,
    ...(row.conflictLevel ? { conflictLevel: row.conflictLevel as ConflictLevel } : {}),
  };
}

export function draftRowsToPreviewRows(rows: DraftRowLike[]) {
  return [...rows]
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .map(draftRowToPreviewRow);
}
