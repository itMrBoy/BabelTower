import type { StandardI18nDocument } from '../standard-i18n/types';
import { buildNestedObject, type JsonExportOptions } from './json-exporter';

function escapeTsStringValue(value: string, quote: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(quote, 'g'), `\\${quote}`)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function exportWithTemplate(
  document: StandardI18nDocument,
  dictionaryPriority: boolean,
) {
  const template = document.metadata?.tsTemplate;
  if (typeof template !== 'string') return null;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const entry of document.entries) {
    const value = dictionaryPriority && entry.translatedValue !== null
      ? entry.translatedValue
      : entry.sourceValue;
    if (value === null) continue;

    const start = Number(entry.metadata?.tsValueStart);
    const end = Number(entry.metadata?.tsValueEnd);
    const quote = entry.metadata?.tsQuote ?? "'";
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    replacements.push({ start, end, value: escapeTsStringValue(value, quote) });
  }

  replacements
    .sort((a, b) => b.start - a.start);

  if (replacements.length === 0) return null;

  let output = template;
  for (const replacement of replacements) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  return output;
}

export function exportToTs(
  document: StandardI18nDocument,
  options: JsonExportOptions = {},
): string {
  const dictionaryPriority = options.dictionaryPriority ?? false;
  const templated = exportWithTemplate(document, dictionaryPriority);
  if (templated !== null) return templated;

  const indent = options.indent ?? 2;
  const obj = buildNestedObject(document.entries, dictionaryPriority);
  return `export default ${JSON.stringify(obj, null, indent)};\n`;
}
