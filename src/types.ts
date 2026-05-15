// BabelTower core type definitions
// Reconstructed from sibling tasks — these define the contract all tests verify against.

/** A single i18n entry in Standard JSON form */
export interface I18nEntry {
  key: string;
  zh: string; // Chinese (primary key for Dictionary)
  en: string; // English
  source_file: string;
  line_number?: number;
  comment?: string;
}

/** Standard JSON — the canonical intermediate representation */
export interface StandardJson {
  entries: I18nEntry[];
  metadata: {
    source_format: "nested_json" | "properties";
    source_file: string;
    total_entries: number;
    parsed_at: string; // ISO 8601
  };
}

/** Conflict types as defined in the architecture */
export type ConflictType =
  | "exact_zh_diff_target" // Same Chinese text, different English
  | "high_similarity" // Very similar Chinese found in Dictionary
  | "duplicate_key" // Same key appears multiple times in source
  | "format_parse_error"; // Source file couldn't be parsed properly

/** A single conflict record */
export interface Conflict {
  id: string;
  type: ConflictType;
  entry: I18nEntry;
  existing_entry?: I18nEntry; // The conflicting entry already in Dictionary
  similarity_score?: number; // For high_similarity
  message: string;
  resolved: boolean;
  resolution?: "keep_new" | "keep_existing" | "merge" | "manual";
  resolved_by?: string;
  resolved_at?: string;
}

/** Task snapshot — user's unsaved progress */
export interface TaskSnapshot {
  id: string;
  task_id: string;
  standard_json: StandardJson;
  conflicts: Conflict[];
  created_at: string;
  updated_at: string;
  status: "draft" | "conflicts_found" | "resolving" | "ready_to_save";
}

/** Dictionary entry — persisted in the database */
export interface DictionaryEntry {
  id: string;
  key: string;
  zh: string; // UNIQUE index
  en: string;
  source_files: string[]; // Which files contributed this entry
  comment?: string;
  created_at: string;
  updated_at: string;
}

/** Diff patch for dictionary updates */
export interface DiffPatch {
  entry_key: string;
  zh: string;
  old_en: string;
  new_en: string;
  source_file: string;
  action: "update" | "skip" | "manual";
}

/** Response from the conflict check endpoint */
export interface ConflictCheckResponse {
  standard_json: StandardJson;
  conflicts: Conflict[];
  existing_dictionary_matches: DictionaryEntry[];
}

/** Export result */
export interface ExportResult {
  format: "nested_json" | "properties";
  content: string;
  preserved_order: boolean;
  preserved_comments: string[];
  entry_count: number;
}
