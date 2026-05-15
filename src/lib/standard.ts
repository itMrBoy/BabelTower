import { createHash } from "node:crypto";
import { parseJson } from "@/domain/parser/json-parser";
import { parseProperties } from "@/domain/parser/properties-parser";
import type {
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
  if (value === "json" || value === "properties") return value;
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
  return {
    ...base,
    entries: rows.map((row) => ({
      key: row.key,
      keyPath: row.keyPath,
      sourceValue: row.sourceValue,
      translatedValue: row.translatedValue,
      locale: base.locale,
      status: row.status,
    })),
  };
}
