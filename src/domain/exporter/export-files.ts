import { exportToJson } from './json-exporter';
import { exportToProperties } from './properties-exporter';
import { exportToTs } from './ts-exporter';
import type { StandardI18nDocument, StandardI18nEntry } from '../standard-i18n/types';

export type ExportFilesResult = {
  files: Record<string, string>;
  sourceFilename: string;
  targetFilename: string;
};

export type BuildDualExportFilesOptions = {
  targetDocument?: StandardI18nDocument | null;
};

function splitFilename(filename: string) {
  const slashIndex = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  const dir = slashIndex >= 0 ? filename.slice(0, slashIndex + 1) : '';
  const leaf = slashIndex >= 0 ? filename.slice(slashIndex + 1) : filename;
  const dotIndex = leaf.lastIndexOf('.');
  if (dotIndex <= 0) return { dir, base: leaf, ext: '' };
  return {
    dir,
    base: leaf.slice(0, dotIndex),
    ext: leaf.slice(dotIndex),
  };
}

export function buildTranslatedFilename(sourceFilename: string, targetFilename?: string | null) {
  if (targetFilename?.trim()) return targetFilename.trim();

  const { dir, base, ext } = splitFilename(sourceFilename);
  const replacements: Array<[RegExp, string]> = [
    [/(^|[-_.])zh-cn($|[-_.])/i, '$1en-us$2'],
    [/(^|[-_.])zh_cn($|[-_.])/i, '$1en_us$2'],
    [/(^|[-_.])zh($|[-_.])/i, '$1en$2'],
    [/中文/g, '英文'],
  ];

  for (const [pattern, replacement] of replacements) {
    const nextBase = base.replace(pattern, replacement);
    if (nextBase !== base) return `${dir}${nextBase}${ext}`;
  }

  return `${dir}${base}.en-US${ext}`;
}

function appendEnglishSuffix(filename: string) {
  const { dir, base, ext } = splitFilename(filename);
  return `${dir}${base}-en${ext}`;
}

function isSameExportFilename(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function renderDocument(document: StandardI18nDocument, dictionaryPriority: boolean) {
  if (document.sourceFormat === 'properties') {
    return exportToProperties(document, { dictionaryPriority });
  }
  if (document.sourceFormat === 'ts') {
    return exportToTs(document, { dictionaryPriority });
  }
  return exportToJson(document, { dictionaryPriority });
}

function stripTemplatePositionMetadata(entry: StandardI18nEntry): StandardI18nEntry {
  if (!entry.metadata) return entry;
  const {
    propertiesValueStart: _propertiesValueStart,
    propertiesValueEnd: _propertiesValueEnd,
    tsValueStart: _tsValueStart,
    tsValueEnd: _tsValueEnd,
    tsQuote: _tsQuote,
    ...metadata
  } = entry.metadata;
  return {
    ...entry,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function buildTranslatedDocument(
  currentDocument: StandardI18nDocument,
  translatedFilename: string,
  targetDocument?: StandardI18nDocument | null,
): StandardI18nDocument {
  if (!targetDocument || targetDocument.sourceFormat !== currentDocument.sourceFormat) {
    return { ...currentDocument, sourceName: translatedFilename, locale: 'en-US' };
  }

  const currentEntryByKey = new Map(currentDocument.entries.map((entry) => [entry.key, entry]));
  const matchedKeys = new Set<string>();
  const targetEntries = targetDocument.entries.map((targetEntry) => {
    const currentEntry = currentEntryByKey.get(targetEntry.key);
    if (!currentEntry) return targetEntry;
    matchedKeys.add(targetEntry.key);
    return {
      ...targetEntry,
      sourceValue: currentEntry.sourceValue,
      translatedValue: currentEntry.translatedValue ?? targetEntry.sourceValue,
      status: currentEntry.status,
    };
  });
  const missingEntries = currentDocument.entries
    .filter((entry) => !matchedKeys.has(entry.key))
    .map(stripTemplatePositionMetadata);

  return {
    ...targetDocument,
    sourceName: translatedFilename,
    locale: 'en-US',
    entries: [...targetEntries, ...missingEntries],
  };
}

export function buildDualExportFiles(
  document: StandardI18nDocument,
  targetFilename?: string | null,
  options: BuildDualExportFilesOptions = {},
): ExportFilesResult {
  const sourceFilename = document.sourceName;
  const proposedTranslatedFilename = buildTranslatedFilename(sourceFilename, targetFilename);
  const translatedFilename = isSameExportFilename(sourceFilename, proposedTranslatedFilename)
    ? appendEnglishSuffix(proposedTranslatedFilename)
    : proposedTranslatedFilename;

  return {
    sourceFilename,
    targetFilename: translatedFilename,
    files: {
      [sourceFilename]: renderDocument(document, false),
      [translatedFilename]: renderDocument(buildTranslatedDocument(document, translatedFilename, options.targetDocument), true),
    },
  };
}
