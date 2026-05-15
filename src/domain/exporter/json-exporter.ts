import { StandardI18nDocument, StandardI18nEntry } from '../standard-i18n/types';

export interface JsonExportOptions {
  /** Indent spaces for pretty-printing (default 2) */
  indent?: number;
  /** When true, apply dictionary-priority: translatedValue overrides sourceValue */
  dictionaryPriority?: boolean;
}

const DEFAULT_OPTIONS: Required<JsonExportOptions> = {
  indent: 2,
  dictionaryPriority: false,
};

/**
 * Build a nested JSON object from a list of entries, preserving original order.
 *
 * When `dictionaryPriority` is true, entries with a `translatedValue` use that
 * instead of `sourceValue` (i.e., dictionary values take precedence over the
 * source file values).
 */
function buildNestedObject(
  entries: StandardI18nEntry[],
  dictionaryPriority: boolean,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const entry of entries) {
    if (entry.status === 'UNSUPPORTED_VALUE' && entry.sourceValue === null) {
      continue;
    }

    const value = dictionaryPriority && entry.translatedValue !== null
      ? entry.translatedValue
      : entry.sourceValue;

    if (value === null) continue;

    let current = root;
    for (let i = 0; i < entry.keyPath.length; i++) {
      const part = entry.keyPath[i];
      const isLast = i === entry.keyPath.length - 1;

      if (isLast) {
        current[part] = value;
      } else {
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
    }
  }

  return root;
}

/**
 * Serialize a StandardI18nDocument back to JSON string.
 *
 * The export preserves the original entry order and builds a nested JSON
 * structure from each entry's keyPath.
 */
export function exportToJson(
  document: StandardI18nDocument,
  options: JsonExportOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const obj = buildNestedObject(document.entries, opts.dictionaryPriority);
  return JSON.stringify(obj, null, opts.indent) + '\n';
}
