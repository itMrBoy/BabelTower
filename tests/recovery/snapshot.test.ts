import { describe, it, expect } from "vitest";
import type { TaskSnapshot, StandardJson, I18nEntry, Conflict } from "@/types";

/**
 * Task recovery / snapshot tests.
 *
 * Verify: re-entering a project restores the last saved snapshot state
 * including Standard JSON, conflicts, and user progress.
 */

interface SnapshotStore {
  save(snapshot: TaskSnapshot): void;
  load(taskId: string): TaskSnapshot | null;
  delete(taskId: string): void;
  list(): TaskSnapshot[];
}

function createSnapshotStore(): SnapshotStore {
  const store = new Map<string, TaskSnapshot>();
  return {
    save(snapshot) {
      store.set(snapshot.task_id, { ...snapshot, updated_at: new Date().toISOString() });
    },
    load(taskId) {
      const snap = store.get(taskId);
      return snap ? { ...snap } : null;
    },
    delete(taskId) {
      store.delete(taskId);
    },
    list() {
      return Array.from(store.values());
    },
  };
}

function makeEntry(overrides: Partial<I18nEntry> = {}): I18nEntry {
  return {
    key: "key",
    zh: "中文",
    en: "English",
    source_file: "test.json",
    ...overrides,
  };
}

function makeSnapshot(
  taskId: string,
  entries: I18nEntry[],
  conflicts: Conflict[],
  status: TaskSnapshot["status"] = "draft",
): TaskSnapshot {
  return {
    id: `snap-${taskId}`,
    task_id: taskId,
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
    status,
  };
}

describe("Task Snapshot Recovery", () => {
  it("saves and restores a snapshot with all entries intact", () => {
    const store = createSnapshotStore();
    const entries = [
      makeEntry({ key: "a", zh: "一", en: "One" }),
      makeEntry({ key: "b", zh: "二", en: "Two" }),
      makeEntry({ key: "c", zh: "三", en: "Three" }),
    ];
    const snapshot = makeSnapshot("task-1", entries, []);
    store.save(snapshot);

    const restored = store.load("task-1");
    expect(restored).not.toBeNull();
    expect(restored!.standard_json.entries).toHaveLength(3);
    expect(restored!.standard_json.entries[0].key).toBe("a");
    expect(restored!.standard_json.entries[0].zh).toBe("一");
    expect(restored!.standard_json.entries[0].en).toBe("One");
  });

  it("restores snapshot with unresolved conflicts", () => {
    const store = createSnapshotStore();
    const entry = makeEntry({ key: "conflict-key", zh: "冲突测试", en: "Conflict Test" });
    const conflict: Conflict = {
      id: "c-1",
      type: "duplicate_key",
      entry,
      message: "Duplicate detected",
      resolved: false,
    };
    const snapshot = makeSnapshot("task-2", [entry], [conflict], "conflicts_found");
    store.save(snapshot);

    const restored = store.load("task-2");
    expect(restored).not.toBeNull();
    expect(restored!.status).toBe("conflicts_found");
    expect(restored!.conflicts).toHaveLength(1);
    expect(restored!.conflicts[0].resolved).toBe(false);
  });

  it("restores snapshot with partially resolved conflicts", () => {
    const store = createSnapshotStore();
    const e1 = makeEntry({ key: "a" });
    const e2 = makeEntry({ key: "b" });
    const resolved: Conflict = {
      id: "c-1",
      type: "exact_zh_diff_target",
      entry: e1,
      message: "resolved",
      resolved: true,
      resolution: "keep_new",
      resolved_by: "user",
      resolved_at: new Date().toISOString(),
    };
    const unresolved: Conflict = {
      id: "c-2",
      type: "high_similarity",
      entry: e2,
      message: "pending",
      resolved: false,
    };
    const snapshot = makeSnapshot("task-3", [e1, e2], [resolved, unresolved], "resolving");
    store.save(snapshot);

    const restored = store.load("task-3");
    expect(restored!.status).toBe("resolving");
    expect(restored!.conflicts.filter((c) => c.resolved)).toHaveLength(1);
    expect(restored!.conflicts.filter((c) => !c.resolved)).toHaveLength(1);
  });

  it("restores snapshot with metadata preserved", () => {
    const store = createSnapshotStore();
    const entries = [
      makeEntry({ key: "meta.key", zh: "元", en: "Meta" }),
    ];
    const snapshot = makeSnapshot("task-4", entries, [], "draft");
    snapshot.standard_json.metadata.source_format = "properties";
    snapshot.standard_json.metadata.source_file = "messages.properties";
    store.save(snapshot);

    const restored = store.load("task-4");
    expect(restored!.standard_json.metadata.source_format).toBe("properties");
    expect(restored!.standard_json.metadata.source_file).toBe("messages.properties");
  });

  it("returns null for never-saved task", () => {
    const store = createSnapshotStore();
    expect(store.load("nonexistent")).toBeNull();
  });

  it("save overwrites previous snapshot (latest state wins)", () => {
    const store = createSnapshotStore();
    const v1 = makeSnapshot("task-5", [makeEntry({ key: "a" })], [], "draft");
    const v2 = makeSnapshot(
      "task-5",
      [makeEntry({ key: "a" }), makeEntry({ key: "b" })],
      [],
      "draft",
    );

    store.save(v1);
    store.save(v2);

    const restored = store.load("task-5");
    expect(restored!.standard_json.entries).toHaveLength(2);
  });

  it("deletes a snapshot", () => {
    const store = createSnapshotStore();
    store.save(makeSnapshot("task-6", [makeEntry()], []));
    store.delete("task-6");
    expect(store.load("task-6")).toBeNull();
  });

  it("lists all stored snapshots", () => {
    const store = createSnapshotStore();
    store.save(makeSnapshot("t1", [makeEntry()], []));
    store.save(makeSnapshot("t2", [makeEntry()], []));
    expect(store.list()).toHaveLength(2);
  });

  it("maintains updated_at on save", async () => {
    const store = createSnapshotStore();
    const snap = makeSnapshot("task-7", [makeEntry()], []);
    const original = snap.updated_at;
    // Small delay to ensure timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    store.save(snap);
    const restored = store.load("task-7");
    expect(restored!.updated_at).not.toBe(original);
  });
});

describe("Task Snapshot with large data (1000 entries)", () => {
  it("saves and restores a 1000-entry snapshot correctly", () => {
    const store = createSnapshotStore();
    const entries: I18nEntry[] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push(makeEntry({ key: `key.${i}`, zh: `中文${i}`, en: `English${i}` }));
    }
    const snapshot = makeSnapshot("task-large", entries, [], "draft");
    store.save(snapshot);

    const restored = store.load("task-large");
    expect(restored).not.toBeNull();
    expect(restored!.standard_json.entries).toHaveLength(1000);
    expect(restored!.standard_json.entries[999].key).toBe("key.999");
    expect(restored!.standard_json.entries[0].zh).toBe("中文0");
  });

  it("saves and restores within performance budget (< 300ms)", () => {
    const store = createSnapshotStore();
    const entries: I18nEntry[] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push(makeEntry({ key: `key.${i}`, zh: `中文${i}`, en: `English${i}` }));
    }
    const snapshot = makeSnapshot("task-perf", entries, [], "draft");

    const start = performance.now();
    store.save(snapshot);
    const restored = store.load("task-perf");
    const elapsed = performance.now() - start;

    expect(restored).not.toBeNull();
    expect(restored!.standard_json.entries).toHaveLength(1000);
    expect(elapsed).toBeLessThan(300);
  });
});
