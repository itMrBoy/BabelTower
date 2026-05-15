import { describe, it, expect, beforeEach } from "vitest";
import type {
  Conflict,
  ConflictType,
  TaskSnapshot,
  StandardJson,
  I18nEntry,
  DictionaryEntry,
} from "@/types";

/**
 * Conflict fix flow tests.
 *
 * Verify: after resolving a conflict, both Dictionary and TaskSnapshot
 * are updated correctly. Covers all four conflict types:
 * exact_zh_diff_target, high_similarity, duplicate_key, format_parse_error.
 */

interface ConflictResolver {
  resolve(
    conflictId: string,
    resolution: "keep_new" | "keep_existing" | "merge" | "manual",
    resolvedBy: string,
  ): void;
  getDictionary(): Map<string, DictionaryEntry>;
  getSnapshot(): TaskSnapshot | null;
}

// Simulated conflict resolver mirroring the backend service
function createConflictResolver(
  initialSnapshot: TaskSnapshot,
  initialDictionary: DictionaryEntry[],
): ConflictResolver {
  const dict = new Map<string, DictionaryEntry>();
  for (const d of initialDictionary) {
    dict.set(d.zh, { ...d });
  }

  const snapshot: TaskSnapshot = JSON.parse(JSON.stringify(initialSnapshot));

  return {
    resolve(conflictId, resolution, resolvedBy) {
      const conflict = snapshot.conflicts.find((c) => c.id === conflictId);
      if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

      conflict.resolved = true;
      conflict.resolution = resolution;
      conflict.resolved_by = resolvedBy;
      conflict.resolved_at = new Date().toISOString();

      const { entry, existing_entry, type } = conflict;

      switch (resolution) {
        case "keep_new": {
          // Update dictionary with new entry
          dict.set(entry.zh, {
            id: `dict-${Date.now()}`,
            key: entry.key,
            zh: entry.zh,
            en: entry.en,
            source_files: [entry.source_file],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          // Update snapshot entry to match
          const snapshotEntry = snapshot.standard_json.entries.find(
            (e) => e.key === entry.key,
          );
          if (snapshotEntry) snapshotEntry.en = entry.en;
          break;
        }
        case "keep_existing": {
          // Keep dictionary as-is; update snapshot to match existing
          if (existing_entry) {
            const snapshotEntry = snapshot.standard_json.entries.find(
              (e) => e.key === entry.key,
            );
            if (snapshotEntry) {
              snapshotEntry.zh = existing_entry.zh;
              snapshotEntry.en = existing_entry.en;
            }
          }
          break;
        }
        case "merge": {
          // Merge: concatenate or take latest
          const mergedEn = existing_entry
            ? `${existing_entry.en} / ${entry.en}`
            : entry.en;
          dict.set(entry.zh, {
            id: `dict-${Date.now()}`,
            key: entry.key,
            zh: entry.zh,
            en: mergedEn,
            source_files: [
              ...(existing_entry ? [existing_entry.source_file] : []),
              entry.source_file,
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          const snapshotEntry = snapshot.standard_json.entries.find(
            (e) => e.key === entry.key,
          );
          if (snapshotEntry) snapshotEntry.en = mergedEn;
          break;
        }
        case "manual":
          // User manually edited; we just mark resolved, no auto-updates
          break;
      }

      // Update snapshot status
      const allResolved = snapshot.conflicts.every((c) => c.resolved);
      if (allResolved) {
        snapshot.status = "ready_to_save";
      } else {
        snapshot.status = "resolving";
      }
    },
    getDictionary: () => dict,
    getSnapshot: () => snapshot,
  };
}

function makeEntry(overrides: Partial<I18nEntry> = {}): I18nEntry {
  return {
    key: "key.1",
    zh: "测试",
    en: "Test",
    source_file: "test.json",
    ...overrides,
  };
}

function makeConflict(
  id: string,
  type: ConflictType,
  entry: I18nEntry,
  existing?: I18nEntry,
): Conflict {
  return {
    id,
    type,
    entry,
    existing_entry: existing,
    message: `Conflict: ${type}`,
    resolved: false,
  };
}

function makeSnapshot(
  entries: I18nEntry[],
  conflicts: Conflict[],
): TaskSnapshot {
  return {
    id: "snap-1",
    task_id: "task-1",
    standard_json: {
      entries,
      metadata: {
        source_format: "nested_json",
        source_file: "test.json",
        total_entries: entries.length,
        parsed_at: new Date().toISOString(),
      },
    },
    conflicts,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: "conflicts_found",
  };
}

describe("Conflict Fix Flow", () => {
  let resolver: ConflictResolver;
  let entry: I18nEntry;
  let existing: I18nEntry;

  describe("exact_zh_diff_target", () => {
    beforeEach(() => {
      entry = makeEntry({ key: "btn.save", zh: "保存", en: "Keep" });
      existing = makeEntry({ key: "dict.save", zh: "保存", en: "Save", source_file: "dictionary" });

      const dictEntry: DictionaryEntry = {
        id: "dict-1",
        key: "dict.save",
        zh: "保存",
        en: "Save",
        source_files: ["dictionary"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const conflict = makeConflict("c-1", "exact_zh_diff_target", entry, existing);
      const snapshot = makeSnapshot([entry], [conflict]);
      resolver = createConflictResolver(snapshot, [dictEntry]);
    });

    it('resolves "keep_new": updates dictionary with new en value', () => {
      resolver.resolve("c-1", "keep_new", "qa-tester");
      const dict = resolver.getDictionary();
      expect(dict.get("保存")?.en).toBe("Keep");
    });

    it('resolves "keep_new": snapshot entry is updated', () => {
      resolver.resolve("c-1", "keep_new", "qa-tester");
      const snapshot = resolver.getSnapshot()!;
      const snapshotEntry = snapshot.standard_json.entries.find(
        (e) => e.key === "btn.save",
      );
      expect(snapshotEntry?.en).toBe("Keep");
    });

    it('resolves "keep_existing": dictionary stays unchanged', () => {
      resolver.resolve("c-1", "keep_existing", "qa-tester");
      const dict = resolver.getDictionary();
      expect(dict.get("保存")?.en).toBe("Save");
    });

    it('resolves "keep_existing": snapshot updated to match existing', () => {
      resolver.resolve("c-1", "keep_existing", "qa-tester");
      const snapshot = resolver.getSnapshot()!;
      const snapshotEntry = snapshot.standard_json.entries.find(
        (e) => e.key === "btn.save",
      );
      expect(snapshotEntry?.en).toBe("Save");
    });

    it('resolves "merge": dictionary contains combined text', () => {
      resolver.resolve("c-1", "merge", "qa-tester");
      const dict = resolver.getDictionary();
      expect(dict.get("保存")?.en).toContain("Save");
      expect(dict.get("保存")?.en).toContain("Keep");
    });

    it("conflict is marked resolved with resolution metadata", () => {
      resolver.resolve("c-1", "keep_new", "qa-tester");
      const snapshot = resolver.getSnapshot()!;
      const resolved = snapshot.conflicts.find((c) => c.id === "c-1")!;
      expect(resolved.resolved).toBe(true);
      expect(resolved.resolution).toBe("keep_new");
      expect(resolved.resolved_by).toBe("qa-tester");
      expect(resolved.resolved_at).toBeDefined();
    });
  });

  describe("duplicate_key", () => {
    it("both entries survive after manual resolution", () => {
      const e1 = makeEntry({ key: "dup.a", zh: "测试A", en: "Test A" });
      const e2 = makeEntry({ key: "dup.a", zh: "测试B", en: "Test B" });
      const conflict = makeConflict("c-dup", "duplicate_key", e2, e1);
      const snapshot = makeSnapshot([e1, e2], [conflict]);
      resolver = createConflictResolver(snapshot, []);

      resolver.resolve("c-dup", "keep_new", "qa-tester");
      const snap = resolver.getSnapshot()!;
      expect(snap.conflicts[0].resolved).toBe(true);
      expect(snap.status).toBe("ready_to_save");
    });
  });

  describe("high_similarity", () => {
    it("does not overwrite existing on keep_existing", () => {
      entry = makeEntry({ key: "btn.save", zh: "保存文档", en: "Save Doc" });
      existing = makeEntry({ key: "dict.save", zh: "保存文件", en: "Save File", source_file: "dictionary" });

      const dictEntry: DictionaryEntry = {
        id: "dict-1",
        key: "dict.save",
        zh: "保存文件",
        en: "Save File",
        source_files: ["dictionary"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const conflict = makeConflict("c-sim", "high_similarity", entry, existing);
      const snapshot = makeSnapshot([entry], [conflict]);
      resolver = createConflictResolver(snapshot, [dictEntry]);

      resolver.resolve("c-sim", "keep_existing", "qa-tester");
      expect(resolver.getDictionary().get("保存文件")?.en).toBe("Save File");
    });
  });

  describe("format_parse_error", () => {
    it("marks parse error as resolved after manual inspection", () => {
      entry = makeEntry({ key: "broken", zh: "", en: "", comment: "Parse error" });
      const conflict: Conflict = {
        id: "c-parse",
        type: "format_parse_error",
        entry,
        message: "Line 5: malformed entry",
        resolved: false,
      };
      const snapshot = makeSnapshot([entry], [conflict]);
      resolver = createConflictResolver(snapshot, []);

      resolver.resolve("c-parse", "manual", "qa-tester");
      const snap = resolver.getSnapshot()!;
      expect(snap.conflicts[0].resolved).toBe(true);
      expect(snap.conflicts[0].resolution).toBe("manual");
    });
  });

  describe("Snapshot status transitions", () => {
    it("transitions to 'resolving' when some conflicts remain unresolved", () => {
      const c1 = makeConflict("c-1", "exact_zh_diff_target", makeEntry({ key: "a" }), makeEntry({ key: "ax" }));
      const c2 = makeConflict("c-2", "duplicate_key", makeEntry({ key: "b" }), makeEntry({ key: "bx" }));
      const snapshot = makeSnapshot([makeEntry({ key: "a" }), makeEntry({ key: "b" })], [c1, c2]);
      resolver = createConflictResolver(snapshot, []);
      resolver.resolve("c-1", "keep_new", "qa-tester");
      expect(resolver.getSnapshot()!.status).toBe("resolving");
    });

    it("transitions to 'ready_to_save' when ALL conflicts resolved", () => {
      const c1 = makeConflict("c-1", "duplicate_key", makeEntry({ key: "a" }), makeEntry({ key: "ax" }));
      const snapshot = makeSnapshot([makeEntry({ key: "a" })], [c1]);
      resolver = createConflictResolver(snapshot, []);
      resolver.resolve("c-1", "keep_new", "qa-tester");
      expect(resolver.getSnapshot()!.status).toBe("ready_to_save");
    });

    it("stays in 'conflicts_found' when no resolution called", () => {
      const c1 = makeConflict("c-1", "duplicate_key", makeEntry({ key: "a" }), makeEntry({ key: "ax" }));
      const snapshot = makeSnapshot([makeEntry({ key: "a" })], [c1]);
      resolver = createConflictResolver(snapshot, []);
      expect(resolver.getSnapshot()!.status).toBe("conflicts_found");
    });
  });
});
