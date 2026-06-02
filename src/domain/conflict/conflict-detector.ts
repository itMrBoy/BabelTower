import {
  StandardI18nEntry,
  ConflictItem,
  ConflictSummary,
  ConflictLevel,
} from '../standard-i18n/types';
import { jaroWinkler } from './jaro-winkler';

export interface ConflictDetectorOptions {
  /** Jaro-Winkler similarity threshold for "similar Chinese" (default 0.9) */
  similarityThreshold?: number;
}

const DEFAULT_OPTIONS: Required<ConflictDetectorOptions> = {
  similarityThreshold: 0.9,
};

/**
 * Normalize text for comparison:
 * NFKC normalize, trim, collapse whitespace runs to single space.
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

type PreparedEntry = {
  entry: StandardI18nEntry;
  normChinese: string;
  normEnglish: string;
};

function prepareEntries(entries: StandardI18nEntry[]): PreparedEntry[] {
  const prepared: PreparedEntry[] = [];
  for (const entry of entries) {
    const chinese = entry.sourceValue;
    if (chinese === null) continue;

    const normChinese = normalizeText(chinese);
    if (normChinese === '') continue;

    prepared.push({
      entry,
      normChinese,
      normEnglish: normalizeText(entry.translatedValue ?? ''),
    });
  }
  return prepared;
}

/**
 * Detect conflicts between newly parsed entries and an existing dictionary.
 *
 * The `newEntries` represent freshly parsed key-value pairs from an uploaded
 * source file. The `existingEntries` represent the current dictionary state.
 *
 * Matching is Chinese-first. A new entry is compared with every dictionary
 * entry so renamed keys still trigger dictionary conflicts:
 *  - Exact Chinese match + English differs → blocking conflict
 *  - Similar Chinese (Jaro-Winkler ≥ threshold) but not exact → warning
 *  - Identical Chinese AND English → info-level entry (no action needed)
 */
export function detectConflicts(
  newEntries: StandardI18nEntry[],
  existingEntries: StandardI18nEntry[],
  options: ConflictDetectorOptions = {},
): ConflictSummary {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const blocking: ConflictItem[] = [];
  const warning: ConflictItem[] = [];
  const info: ConflictItem[] = [];
  const existingPrepared = prepareEntries(existingEntries);
  const exactExistingByChinese = new Map<string, PreparedEntry[]>();

  for (const existing of existingPrepared) {
    const items = exactExistingByChinese.get(existing.normChinese);
    if (items) {
      items.push(existing);
    } else {
      exactExistingByChinese.set(existing.normChinese, [existing]);
    }
  }

  for (const incoming of prepareEntries(newEntries)) {
    const newEntry = incoming.entry;
    const newChinese = newEntry.sourceValue;
    if (newChinese === null) continue;

    const exactExisting = exactExistingByChinese.get(incoming.normChinese) ?? [];
    for (const existing of exactExisting) {
      const existingEnglish = existing.entry.translatedValue;
      const englishDiffers = incoming.normEnglish !== existing.normEnglish;

      const item: ConflictItem = {
        key: newEntry.key,
        keyPath: newEntry.keyPath,
        chineseValue: newChinese,
        existingEnglish: existingEnglish ?? '',
        newEnglish: newEntry.translatedValue ?? '',
        level: 'info',
      };

      if (englishDiffers) {
        item.level = 'blocking';
        blocking.push(item);
      } else {
        info.push(item);
      }
    }

    for (const existing of existingPrepared) {
      if (incoming.normChinese === existing.normChinese) continue;

      const existingEnglish = existing.entry.translatedValue;
      const similarity = jaroWinkler(incoming.normChinese, existing.normChinese);
      if (similarity >= opts.similarityThreshold) {
        warning.push({
          key: newEntry.key,
          keyPath: newEntry.keyPath,
          chineseValue: newChinese,
          existingEnglish: existingEnglish ?? '',
          newEnglish: newEntry.translatedValue ?? '',
          level: 'warning',
          similarity,
        });
      }
    }
  }

  return {
    blocking,
    warning,
    info,
    hasBlocking: blocking.length > 0,
  };
}
