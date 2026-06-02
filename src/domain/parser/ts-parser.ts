import { parseJson } from './json-parser';
import type { StandardI18nDocument, StandardI18nEntry } from '../standard-i18n/types';

export interface TsParserOptions {
  locale?: string;
  sourceName?: string;
}

function extractDefaultObject(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/\bexport\s+default\s+([\s\S]*?);?\s*$/);
  if (!match) {
    throw new Error('TS file must use `export default { ... }` format.');
  }
  return match[1].trim();
}

function parseObjectLiteral(input: string): Record<string, unknown> {
  const objectLiteral = extractDefaultObject(input);
  // The TS upload contract is a static `export default { ... }` object.
  // Evaluate only that object literal so unquoted keys / single quotes work.
  const value = Function(`"use strict"; return (${objectLiteral});`)() as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TS default export must be an object.');
  }
  return value as Record<string, unknown>;
}

function decodeStringLiteral(literal: string) {
  return Function(`"use strict"; return (${literal});`)() as string;
}

function collectStringValueRanges(input: string, entries: StandardI18nEntry[]) {
  const ranges = new Map<string, { start: number; end: number; quote: string }>();
  const stringLiteralPattern = /(["'])(?:\\.|(?!\1)[\s\S])*\1/g;
  stringLiteralPattern.lastIndex = Math.max(0, input.search(/\bexport\s+default\b/));
  let entryIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = stringLiteralPattern.exec(input)) && entryIndex < entries.length) {
    const literal = match[0];
    const quote = match[1];
    const tokenEnd = match.index + literal.length;
    const nextNonSpace = input.slice(tokenEnd).match(/\S/);
    if (nextNonSpace?.[0] === ':') continue;

    let decoded: string;
    try {
      decoded = decodeStringLiteral(literal);
    } catch {
      continue;
    }

    const entry = entries[entryIndex];
    if (decoded !== entry.sourceValue) continue;

    ranges.set(entry.key, {
      start: match.index + 1,
      end: tokenEnd - 1,
      quote,
    });
    entryIndex++;
  }

  return ranges;
}

export function parseTs(
  input: string,
  options: TsParserOptions = {},
): StandardI18nDocument {
  const locale = options.locale ?? 'en';
  const sourceName = options.sourceName ?? 'unknown.ts';
  const document = parseJson(parseObjectLiteral(input), { locale, sourceName });
  const rangesByKey = collectStringValueRanges(input, document.entries);
  return {
    ...document,
    entries: document.entries.map((entry) => {
      const range = rangesByKey.get(entry.key);
      return range
        ? {
            ...entry,
            metadata: {
              ...entry.metadata,
              tsValueStart: String(range.start),
              tsValueEnd: String(range.end),
              tsQuote: range.quote,
            },
          }
        : entry;
    }),
    sourceFormat: 'ts',
    sourceName,
    metadata: {
      ...document.metadata,
      tsTemplate: input,
    },
  };
}
