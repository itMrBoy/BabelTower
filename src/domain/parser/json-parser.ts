import {
  StandardI18nDocument,
  StandardI18nEntry,
  SourceLocation,
  SourceFormat,
  EntryStatus,
} from '../standard-i18n/types';

export interface JsonParserOptions {
  locale?: string;
  sourceName?: string;
}

/**
 * Position tracker: scans raw JSON text to find line/column for string values.
 */
class PositionScanner {
  readonly text: string;
  private lineStarts: number[];

  constructor(text: string) {
    this.text = text;
    // Pre-compute line start positions
    this.lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        this.lineStarts.push(i + 1);
      }
    }
  }

  /** Approximate: find the first occurrence of value after startIndex. */
  locate(value: string, startIndex: number): SourceLocation | undefined {
    const idx = this.text.indexOf(value, startIndex);
    if (idx === -1) return undefined;

    // Binary search to find which line
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    const line = lo + 1; // 1-based
    const column = idx - this.lineStarts[lo] + 1; // 1-based
    return { line, column };
  }
}

/**
 * Recursively walk a parsed JSON object and collect string leaf values.
 */
function walkObject(
  obj: unknown,
  keyPath: string[],
  entries: StandardI18nEntry[],
  locale: string,
  scanner?: PositionScanner,
  searchFrom: number = 0,
): number {
  if (obj === null || typeof obj !== 'object') {
    return searchFrom;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const itemKeyPath = [...keyPath, String(i)];
      const item = obj[i];
      if (typeof item === 'string') {
        const key = itemKeyPath.join('.');
        let loc: SourceLocation | undefined;
        if (scanner) {
          // For array items, try to locate after previous match
          const found = scanner!.locate(item, searchFrom);
          if (found) {
            loc = found;
            searchFrom = scanner!.text.indexOf(item, searchFrom) + item.length;
          }
        }
        entries.push({
          key,
          keyPath: itemKeyPath,
          sourceValue: item,
          translatedValue: null,
          locale,
          status: 'UNSUPPORTED_VALUE' as EntryStatus,
          sourceLocation: loc,
        });
      } else {
        const key = itemKeyPath.join('.');
        const nonStringTypes = ['number', 'boolean', 'undefined'];
        const isUnsupported =
          item === null || nonStringTypes.includes(typeof item) || Array.isArray(item);
        entries.push({
          key,
          keyPath: itemKeyPath,
          sourceValue: isUnsupported ? null : String(item),
          translatedValue: null,
          locale,
          status: 'UNSUPPORTED_VALUE' as EntryStatus,
        });
        // Still recurse into nested objects in arrays
        if (item !== null && typeof item === 'object') {
          searchFrom = walkObject(item, itemKeyPath, entries, locale, scanner, searchFrom);
        }
      }
    }
    return searchFrom;
  }

  // Plain object
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const key of keys) {
    const currentKeyPath = [...keyPath, key];
    const value = record[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse
      searchFrom = walkObject(value, currentKeyPath, entries, locale, scanner, searchFrom);
    } else if (typeof value === 'string') {
      const dotKey = currentKeyPath.join('.');
      let loc: SourceLocation | undefined;
      if (scanner) {
        // Find the key:value pair in the raw text
        // The key appears after our last position
        const searchText = `"${key}"`;
        const keyIdx = scanner.text.indexOf(searchText, searchFrom);
        if (keyIdx !== -1) {
          // Find the value after the colon
          const afterColon = scanner.text.indexOf('"', keyIdx + searchText.length);
          if (afterColon !== -1) {
            loc = scanner.locate(value, afterColon);
            searchFrom = afterColon + value.length + 2; // +2 for quotes
          }
        }
      }
      entries.push({
        key: dotKey,
        keyPath: currentKeyPath,
        sourceValue: value,
        translatedValue: null,
        locale,
        status: 'NORMAL' as EntryStatus,
        sourceLocation: loc,
      });
    } else {
      // Non-string value
      const dotKey = currentKeyPath.join('.');
      entries.push({
        key: dotKey,
        keyPath: currentKeyPath,
        sourceValue: null,
        translatedValue: null,
        locale,
        status: 'UNSUPPORTED_VALUE' as EntryStatus,
      });
    }
  }

  return searchFrom;
}

/**
 * Parse a JSON i18n file into a StandardI18nDocument.
 *
 * Accepts either a pre-parsed object or a JSON string. When a string is
 * provided, source locations (line/column) are populated.
 */
export function parseJson(
  input: string | Record<string, unknown>,
  options: JsonParserOptions = {},
): StandardI18nDocument {
  const locale = options.locale ?? 'en';
  const sourceName = options.sourceName ?? 'unknown.json';

  let obj: Record<string, unknown>;
  let scanner: PositionScanner | undefined;

  if (typeof input === 'string') {
    scanner = new PositionScanner(input);
    obj = JSON.parse(input) as Record<string, unknown>;
  } else {
    obj = input;
  }

  const entries: StandardI18nEntry[] = [];
  walkObject(obj, [], entries, locale, scanner, 0);

  return {
    entries,
    locale,
    sourceFormat: 'json' as SourceFormat,
    sourceName,
  };
}
