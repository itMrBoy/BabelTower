import {
  StandardI18nDocument,
  StandardI18nEntry,
  ConflictItem,
  ConflictSummary,
  DiffPatch,
  DiffResult,
  TaskSnapshot,
  SaveResult,
  ResolutionAction,
  ResolutionRecord,
  TaskSnapshotStatus,
} from '../standard-i18n/types';
import { detectConflicts } from '../conflict/conflict-detector';
import { exportToJson } from '../exporter/json-exporter';
import { exportToProperties } from '../exporter/properties-exporter';
import { exportToTs } from '../exporter/ts-exporter';

// ── Validation ──

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a document before saving:
 * - Must have at least one entry
 * - All entries must have a non-empty key
 * - All entries must have a non-null sourceValue or translatedValue
 * - Entries with same key must have consistent keyPath length
 */
export function validateDocument(doc: StandardI18nDocument): ValidationResult {
  const errors: ValidationError[] = [];

  if (!doc.entries || doc.entries.length === 0) {
    errors.push({ field: 'entries', message: 'Document must have at least one entry' });
    return { valid: false, errors };
  }

  for (let i = 0; i < doc.entries.length; i++) {
    const entry = doc.entries[i];
    if (!entry.key || entry.key.trim() === '') {
      errors.push({ field: `entries[${i}].key`, message: 'Entry key must not be empty' });
    }
    if (entry.sourceValue === null && entry.translatedValue === null) {
      errors.push({
        field: `entries[${i}].key`,
        message: `Entry "${entry.key}" must have at least sourceValue or translatedValue`,
      });
    }
  }

  // Check keyPath consistency: same key should have same keyPath length
  const keyPathLengths = new Map<string, number>();
  for (const entry of doc.entries) {
    const existing = keyPathLengths.get(entry.key);
    if (existing !== undefined && existing !== entry.keyPath.length) {
      errors.push({
        field: `entries key="${entry.key}"`,
        message: `Inconsistent keyPath length: expected ${existing}, got ${entry.keyPath.length}`,
      });
    } else {
      keyPathLengths.set(entry.key, entry.keyPath.length);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Diff generation ──

export interface SyncOptions {
  /** Auto-resolve strategies for conflict levels */
  autoResolutions?: ResolutionRecord;
}

/**
 * Generate a DiffResult by comparing new entries against existing dictionary entries.
 * Conflicts are grouped per-entry; resolution actions can be pre-applied.
 */
export function generateDiff(
  newEntries: StandardI18nEntry[],
  existingEntries: StandardI18nEntry[],
  options: SyncOptions = {},
): DiffResult {
  const summary: ConflictSummary = detectConflicts(newEntries, existingEntries);

  // Build patches: one per blocking + warning item
  const patches: DiffPatch[] = [];
  const allConflicts: ConflictItem[] = [
    ...summary.blocking,
    ...summary.warning,
    ...summary.info,
  ];

  // Build resolutions map from options
  const resolutions: ResolutionRecord = { ...(options.autoResolutions ?? {}) };

  for (const item of allConflicts) {
    const existingRes = resolutions[item.key];
    if (!existingRes) {
      patches.push({
        items: [item],
        resolutions: {},
      });
    } else {
      // Pre-resolved — still document it in a patch but note the resolution
      patches.push({
        items: [item],
        resolutions: { [item.key]: existingRes },
      });
    }
  }

  return { patches, summary };
}

// ── Save ──

export interface SaveOptions {
  /** Existing dictionary entries (if syncing) */
  existingDictionary?: StandardI18nEntry[];
  /** Pre-defined resolution strategies */
  resolutions?: ResolutionRecord;
  /** Task identifier for the snapshot */
  taskId?: string;
}

/**
 * Save a parsed document as a TaskSnapshot, optionally syncing with an existing
 * dictionary and generating diff patches for user confirmation.
 *
 * Returns the snapshot and any detected conflicts.
 */
export function saveDocument(
  document: StandardI18nDocument,
  options: SaveOptions = {},
): SaveResult {
  const taskId = options.taskId ?? 'manual';

  // Validate
  const validation = validateDocument(document);
  if (!validation.valid) {
    return {
      snapshot: {
        taskId,
        document,
        status: 'FAILED' as TaskSnapshotStatus,
        createdAt: new Date().toISOString(),
      },
      dictionaryUpdated: false,
    };
  }

  const snapshot: TaskSnapshot = {
    taskId,
    document,
    status: 'SAVED' as TaskSnapshotStatus,
    createdAt: new Date().toISOString(),
  };

  // Sync with dictionary if existing entries provided
  let diffResult: DiffResult | undefined;
  let dictionaryUpdated = false;

  if (options.existingDictionary && options.existingDictionary.length > 0) {
    diffResult = generateDiff(document.entries, options.existingDictionary, {
      autoResolutions: options.resolutions,
    });

    // If all conflicts are pre-resolved and no blocking conflicts remain
    if (!diffResult.summary.hasBlocking) {
      dictionaryUpdated = true;
    }
  }

  return { snapshot, diffResult, dictionaryUpdated };
}

// ── Export ──

export interface ExportResult {
  [filename: string]: string;
}

/**
 * Export a document as one or more files. When a dictionary document is
 * provided, produces a dual-file export where the dictionary takes priority
 * for translated values.
 *
 * Returns a map of filename → content.
 */
export function exportDocument(
  document: StandardI18nDocument,
  dictionary?: StandardI18nDocument,
): ExportResult {
  const result: ExportResult = {};
  const baseName = document.sourceName.replace(/\.(json|properties|ts)$/, '');

  if (document.sourceFormat === 'json') {
    // Source-only export
    result[document.sourceName] = exportToJson(document, { dictionaryPriority: false });

    // Dictionary-priority export (if dictionary provided)
    if (dictionary) {
      result[`${baseName}.dictionary.${dictionary.locale}.json`] = exportToJson(document, {
        dictionaryPriority: true,
      });
    }
  } else if (document.sourceFormat === 'ts') {
    result[document.sourceName] = exportToTs(document, { dictionaryPriority: false });

    if (dictionary) {
      result[`${baseName}.dictionary.${dictionary.locale}.ts`] = exportToTs(document, {
        dictionaryPriority: true,
      });
    }
  } else {
    // Properties source export
    result[document.sourceName] = exportToProperties(document, { dictionaryPriority: false });

    // Dictionary-priority export
    if (dictionary) {
      result[`${baseName}.dictionary.${dictionary.locale}.properties`] = exportToProperties(
        document,
        { dictionaryPriority: true },
      );
    }
  }

  return result;
}

// ── Resolution application ──

/**
 * Apply resolution actions to a diff result and produce an updated entry list.
 *
 * - KEEP_EXISTING: keep the existing dictionary's English value
 * - UPDATE_DICTIONARY: update with the new file's English value
 * - IGNORE_SIMILAR: skip warning-level entries (keep existing)
 */
export function applyResolutions(
  entries: StandardI18nEntry[],
  existingEntries: StandardI18nEntry[],
  resolutions: ResolutionRecord,
): StandardI18nEntry[] {
  const existingByKey = new Map<string, StandardI18nEntry>();
  for (const entry of existingEntries) {
    existingByKey.set(entry.key, entry);
  }

  return entries.map((entry) => {
    const resolution = resolutions[entry.key];
    if (!resolution) return entry;

    const existing = existingByKey.get(entry.key);
    if (!existing) return entry;

    switch (resolution) {
      case 'KEEP_EXISTING':
        return {
          ...entry,
          translatedValue: existing.translatedValue,
        };
      case 'UPDATE_DICTIONARY':
        return {
          ...entry,
          translatedValue: entry.translatedValue ?? entry.sourceValue,
        };
      case 'IGNORE_SIMILAR':
        return {
          ...entry,
          translatedValue: existing.translatedValue,
        };
      default:
        return entry;
    }
  });
}
