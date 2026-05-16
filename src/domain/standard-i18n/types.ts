// ── Source location info ──
export interface SourceLocation {
  line: number;
  column: number;
}

// ── Entry status flags ──
export type EntryStatus =
  | 'NORMAL'
  | 'UNSUPPORTED_VALUE'   // non-string leaf (number, boolean, null, array item)
  | 'DUPLICATED_KEY';     // duplicate key in .properties

// ── A single i18n key-value entry ──
export interface StandardI18nEntry {
  /** Dot-notation key path (e.g. "a.b.c") */
  key: string;
  /** Original key segments (e.g. ["a", "b", "c"]) */
  keyPath: string[];
  /** Source-language value (e.g. Chinese text extracted from parsed input) */
  sourceValue: string | null;
  /** Translated value (e.g. English text from dictionary / manual input) */
  translatedValue: string | null;
  /** Target locale (e.g. "en", "zh-CN") */
  locale: string;
  /** Entry status */
  status: EntryStatus;
  /** Source location in original file */
  sourceLocation?: SourceLocation;
  /** Arbitrary metadata (e.g. leading comments from .properties) */
  metadata?: Record<string, string>;
}

// ── Supported source formats ──
export type SourceFormat = 'json' | 'properties';

// ── Parsed i18n document ──
export interface StandardI18nDocument {
  entries: StandardI18nEntry[];
  locale: string;
  sourceFormat: SourceFormat;
  /** Original file name / source identifier */
  sourceName: string;
  /** Document-level metadata */
  metadata?: Record<string, unknown>;
}

// ── Preview row for UI display ──
export interface PreviewRow {
  key: string;
  keyPath: string[];
  sourceValue: string | null;
  translatedValue: string | null;
  status: EntryStatus;
}

// ── Conflict types ──
export type ConflictLevel = 'blocking' | 'warning' | 'info';

export interface ConflictItem {
  key: string;
  keyPath: string[];
  /** Chinese text from the new file */
  chineseValue: string;
  /** Existing dictionary English value */
  existingEnglish: string;
  /** New file English value */
  newEnglish: string;
  /** Conflict severity */
  level: ConflictLevel;
  /** Jaro-Winkler similarity (for similar matches) */
  similarity?: number;
}

export interface ConflictSummary {
  blocking: ConflictItem[];
  warning: ConflictItem[];
  info: ConflictItem[];
  hasBlocking: boolean;
}

// ── Resolution types ──
export type ResolutionAction =
  | 'KEEP_EXISTING'
  | 'UPDATE_DICTIONARY'
  | 'IGNORE_SIMILAR';

export interface DiffPatch {
  items: ConflictItem[];
  resolutions: ResolutionRecord;
}

export interface ResolutionRecord {
  [keyPath: string]: ResolutionAction;
}

export interface DiffResult {
  patches: DiffPatch[];
  summary: ConflictSummary;
}

// ── Save / persistence types ──
export type TaskSnapshotStatus = 'SAVED' | 'FAILED';

export interface TaskSnapshot {
  id?: string;
  taskId: string;
  document: StandardI18nDocument;
  status: TaskSnapshotStatus;
  createdAt: string;
}

export interface SaveResult {
  snapshot: TaskSnapshot;
  diffResult?: DiffResult;
  dictionaryUpdated: boolean;
}
