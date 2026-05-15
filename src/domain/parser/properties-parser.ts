import {
  StandardI18nDocument,
  StandardI18nEntry,
  SourceLocation,
  SourceFormat,
} from '../standard-i18n/types';

export interface PropertiesParserOptions {
  locale?: string;
  sourceName?: string;
}

/**
 * Restore \\uXXXX escape sequences to actual Unicode characters.
 */
function unescapeUnicode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/**
 * Parse a .properties file content into a StandardI18nDocument.
 *
 * Supports:
 * - key=value and key:value delimiters
 * - \\uXXXX Unicode escape restoration
 * - Multi-line values (trailing \\ continuation)
 * - # and ! comment lines (metadata preserved)
 * - Duplicate key detection (last value wins + DUPLICATED_KEY flag)
 */
export function parseProperties(
  input: string,
  options: PropertiesParserOptions = {},
): StandardI18nDocument {
  const locale = options.locale ?? 'en';
  const sourceName = options.sourceName ?? 'unknown.properties';

  const rawLines = input.split(/\r?\n/);
  const entries: StandardI18nEntry[] = [];
  const seenKeys = new Map<string, number>(); // key → entry index
  let currentComment: string | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    let line = rawLines[i];

    // ── Comment lines ──
    const trimmedLead = line.trimStart();
    if (trimmedLead === '' || trimmedLead.startsWith('#') || trimmedLead.startsWith('!')) {
      // Accumulate comment text (without #/!)
      const commentText = trimmedLead.replace(/^[#!]\s*/, '');
      if (commentText) {
        currentComment = currentComment
          ? currentComment + '\n' + commentText
          : commentText;
      }
      continue;
    }

    // ── Key-value line (may continue on next lines) ──
    // Handle continuation: join lines ending with backslash (not escaped)
    let fullLine = line;
    while (
      fullLine.endsWith('\\') &&
      !fullLine.endsWith('\\\\') &&
      i + 1 < rawLines.length
    ) {
      i++;
      fullLine = fullLine.slice(0, -1) + rawLines[i];
    }

    // Trim leading whitespace from the full logical line
    fullLine = fullLine.trimStart();

    // Determine delimiter position (= or :)
    const eqIdx = findDelimiter(fullLine);
    if (eqIdx === -1) continue; // malformed line, skip

    let rawKey = fullLine.slice(0, eqIdx).trimEnd();
    let rawValue = fullLine.slice(eqIdx + 1).trim();

    // Unescape Unicode in key and value
    const key = unescapeUnicode(rawKey);
    const value = unescapeUnicode(rawValue);

    // Build key path (handle potential leading dot or multiple segments?)
    // In standard .properties, keys are flat or use dot notation literally
    const keyPath = key.split('.');

    // Check for duplicate key
    const existingIdx = seenKeys.get(key);
    let status: 'NORMAL' | 'DUPLICATED_KEY' = 'NORMAL';

    const location: SourceLocation = { line: lineNumber, column: 1 };

    if (existingIdx !== undefined) {
      status = 'DUPLICATED_KEY';
      // Update existing entry — .properties semantics: last wins
      const existing = entries[existingIdx];
      existing.sourceValue = value;
      existing.status = 'DUPLICATED_KEY';
      existing.sourceLocation = location;
      if (currentComment) {
        existing.metadata = { ...existing.metadata, comment: currentComment };
      }
    }

    entries.push({
      key,
      keyPath,
      sourceValue: value,
      translatedValue: null,
      locale,
      status,
      sourceLocation: location,
      metadata: currentComment ? { comment: currentComment } : undefined,
    });

    if (existingIdx === undefined) {
      seenKeys.set(key, entries.length - 1);
    }

    // Reset comment accumulator for next line
    currentComment = null;
  }

  return {
    entries,
    locale,
    sourceFormat: 'properties' as SourceFormat,
    sourceName,
  };
}

/**
 * Find the first unescaped '=' or ':' delimiter in a .properties key-value line.
 * Returns -1 if no delimiter is found.
 */
function findDelimiter(line: string): number {
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '=' || ch === ':') {
      return i;
    }
  }
  return -1;
}
