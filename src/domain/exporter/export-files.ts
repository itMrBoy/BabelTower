import { exportToJson } from './json-exporter';
import { exportToProperties } from './properties-exporter';
import { exportToTs } from './ts-exporter';
import type { StandardI18nDocument } from '../standard-i18n/types';

export type ExportFilesResult = {
  files: Record<string, string>;
  sourceFilename: string;
  targetFilename: string;
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

function renderDocument(document: StandardI18nDocument, dictionaryPriority: boolean) {
  if (document.sourceFormat === 'properties') {
    return exportToProperties(document, { dictionaryPriority });
  }
  if (document.sourceFormat === 'ts') {
    return exportToTs(document, { dictionaryPriority });
  }
  return exportToJson(document, { dictionaryPriority });
}

export function buildDualExportFiles(
  document: StandardI18nDocument,
  targetFilename?: string | null,
): ExportFilesResult {
  const sourceFilename = document.sourceName;
  const translatedFilename = buildTranslatedFilename(sourceFilename, targetFilename);

  return {
    sourceFilename,
    targetFilename: translatedFilename,
    files: {
      [sourceFilename]: renderDocument(document, false),
      [translatedFilename]: renderDocument(
        { ...document, sourceName: translatedFilename, locale: 'en-US' },
        true,
      ),
    },
  };
}
