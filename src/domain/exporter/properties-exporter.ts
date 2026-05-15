import { StandardI18nDocument, StandardI18nEntry } from '../standard-i18n/types';

export interface PropertiesExportOptions {
  /** When true, apply dictionary-priority: translatedValue overrides sourceValue */
  dictionaryPriority?: boolean;
}

const DEFAULT_OPTIONS: Required<PropertiesExportOptions> = {
  dictionaryPriority: false,
};

/**
 * Escape special characters for .properties output.
 * Escapes backslashes, = (at start of value), : (at start of value), and whitespace.
 */
function escapeValue(value: string): string {
  let result = '';
  for (const ch of value) {
    switch (ch) {
      case '\\':
        result += '\\\\';
        break;
      case '\n':
        result += '\\n';
        break;
      case '\r':
        result += '\\r';
        break;
      case '\t':
        result += '\\t';
        break;
      default:
        if (/[\x00-\x1f]/.test(ch)) {
          result += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
        } else {
          result += ch;
        }
    }
  }
  return result;
}

/**
 * Serialize a StandardI18nDocument back to .properties format.
 *
 * Outputs `key=value` lines preserving the original entry order.
 * Non-null entries with NORMAL status are included. Supports dictionary
 * priority: when enabled, translatedValue is used over sourceValue.
 *
 * Leading comments from entry.metadata are written as # comment lines.
 */
export function exportToProperties(
  document: StandardI18nDocument,
  options: PropertiesExportOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  for (const entry of document.entries) {
    if (entry.status === 'UNSUPPORTED_VALUE' && entry.sourceValue === null) {
      continue;
    }

    const value = opts.dictionaryPriority && entry.translatedValue !== null
      ? entry.translatedValue
      : entry.sourceValue;

    if (value === null) continue;

    // Write leading comment if available
    if (entry.metadata?.comment) {
      const commentLines = entry.metadata.comment.split('\n');
      for (const cl of commentLines) {
        lines.push(`# ${cl}`);
      }
    }

    lines.push(`${entry.key}=${escapeValue(value)}`);
  }

  return lines.join('\n') + '\n';
}
