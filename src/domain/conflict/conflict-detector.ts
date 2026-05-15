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

  for (const newEntry of newEntries) {
    const newChinese = newEntry.sourceValue;
    if (newChinese === null) continue;

    const normNew = normalizeText(newChinese);
    if (normNew === '') continue;

    for (const existing of existingEntries) {
      const existingChinese = existing.sourceValue;
      if (existingChinese === null) continue;

      const normExisting = normalizeText(existingChinese);
      if (normExisting === '') continue;

      const newEnglish = newEntry.translatedValue;
      const existingEnglish = existing.translatedValue;
      const normNewEng = normalizeText(newEnglish ?? '');
      const normExistingEng = normalizeText(existingEnglish ?? '');
      const englishDiffers = normNewEng !== normExistingEng;

      const item: ConflictItem = {
        key: newEntry.key,
        keyPath: newEntry.keyPath,
        chineseValue: newChinese,
        existingEnglish: existingEnglish ?? '',
        newEnglish: newEnglish ?? '',
        level: 'info',
      };

      if (normNew === normExisting) {
        if (englishDiffers) {
          item.level = 'blocking';
          blocking.push(item);
        } else {
          info.push(item);
        }
        continue;
      }

      const similarity = jaroWinkler(normNew, normExisting);
      if (similarity >= opts.similarityThreshold) {
        item.level = 'warning';
        item.similarity = similarity;
        warning.push(item);
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
