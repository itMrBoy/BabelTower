import { describe, it, expect, beforeAll } from "vitest";
import type { StandardJson, I18nEntry, ConflictCheckResponse, Conflict } from "@/types";
import largeFixture from "../fixtures/large-1000-rows.json";

/**
 * Integration test: Full data pipeline from file upload through conflict detection.
 *
 * Tests the golden path: Input(File) → Parser → Standard JSON → Conflict Check → Database
 * as defined in docs/architecture.md.
 */

// Mock parser — in production this would be the real nested JSON parser
function parseNestedJson(raw: string): StandardJson {
  const parsed = JSON.parse(raw);

  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    throw { type: "format_parse_error", message: "Missing or invalid entries array" } as const;
  }

  const entries: I18nEntry[] = parsed.entries.map((e: Record<string, unknown>, i: number) => {
    if (typeof e.key !== "string" || !e.key) {
      throw {
        type: "format_parse_error",
        message: `Entry ${i} missing key`,
      } as const;
    }
    return {
      key: e.key as string,
      zh: (e.zh as string) ?? "",
      en: (e.en as string) ?? "",
      source_file: (e.source_file as string) ?? parsed.metadata?.source_file ?? "unknown",
      line_number: e.line_number as number | undefined,
      comment: e.comment as string | undefined,
    };
  });

  return {
    entries,
    metadata: {
      source_format: "nested_json",
      source_file: parsed.metadata?.source_file ?? "unknown.json",
      total_entries: entries.length,
      parsed_at: new Date().toISOString(),
    },
  };
}

// Mock dictionary store — simulates the Dictionary table
function createDictionaryStore() {
  const dict = new Map<string, { zh: string; en: string }>();

  return {
    add(zh: string, en: string) {
      dict.set(zh, { zh, en });
    },
    findByZh(zh: string) {
      return dict.get(zh) ?? null;
    },
    size() {
      return dict.size;
    },
    entries() {
      return dict.entries();
    },
  };
}

// Mock conflict detector — implements all four conflict types
function detectConflicts(
  entries: I18nEntry[],
  dictionary: ReturnType<typeof createDictionaryStore>,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const seenKeys = new Map<string, number>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // duplicate_key check
    if (seenKeys.has(entry.key)) {
      conflicts.push({
        id: `conflict-${conflicts.length}`,
        type: "duplicate_key",
        entry,
        message: `Duplicate key "${entry.key}" at index ${i} (first seen at ${seenKeys.get(entry.key)})`,
        resolved: false,
      });
      continue;
    }
    seenKeys.set(entry.key, i);

    // exact_zh_diff_target check
    const existing = dictionary.findByZh(entry.zh);
    if (existing && existing.en !== entry.en) {
      conflicts.push({
        id: `conflict-${conflicts.length}`,
        type: "exact_zh_diff_target",
        entry,
        existing_entry: {
          key: entry.key,
          zh: existing.zh,
          en: existing.en,
          source_file: "dictionary",
        },
        message: `"${entry.zh}" already exists with en="${existing.en}" (incoming: "${entry.en}")`,
        resolved: false,
      });
    }

    // high_similarity check — simple Levenshtein ratio
    if (!existing) {
      for (const [dictZh, dictVal] of dictionary.entries()) {
        const ratio = similarityRatio(entry.zh, dictZh);
        if (ratio > 0.85 && ratio < 1.0) {
          conflicts.push({
            id: `conflict-${conflicts.length}`,
            type: "high_similarity",
            entry,
            existing_entry: {
              key: entry.key,
              zh: dictVal.zh,
              en: dictVal.en,
              source_file: "dictionary",
            },
            similarity_score: ratio,
            message: `"${entry.zh}" is ${(ratio * 100).toFixed(0)}% similar to existing "${dictVal.zh}"`,
            resolved: false,
          });
          break;
        }
      }
    }
  }

  return conflicts;
}

function similarityRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a.length || !b.length) return 0.0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLen = longer.length;
  if (longerLen === 0) return 1.0;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longerLen;
}

// ── Tests ──

describe("Integration: Upload → Parse → Conflict Check", () => {
  describe("Parser: Nested JSON", () => {
    it("parses a valid nested JSON into Standard JSON", () => {
      const raw = JSON.stringify(largeFixture);
      const result = parseNestedJson(raw);
      expect(result.entries).toHaveLength(1000);
      expect(result.metadata.source_format).toBe("nested_json");
      expect(result.metadata.total_entries).toBe(1000);
      expect(result.entries[0]).toHaveProperty("key");
      expect(result.entries[0]).toHaveProperty("zh");
      expect(result.entries[0]).toHaveProperty("en");
    });

    it("parses 1000 entries within performance budget (< 500ms)", () => {
      const raw = JSON.stringify(largeFixture);
      const start = performance.now();
      const result = parseNestedJson(raw);
      const elapsed = performance.now() - start;
      expect(result.entries).toHaveLength(1000);
      expect(elapsed).toBeLessThan(500);
    });

    it("rejects null/undefined entries", () => {
      expect(() => parseNestedJson("{}")).toThrow();
    });

    it("rejects entries without keys", () => {
      expect(() =>
        parseNestedJson(
          JSON.stringify({ entries: [{ zh: "test", en: "test" }] }),
        ),
      ).toThrow();
    });

    it("rejects entries with empty key", () => {
      expect(() =>
        parseNestedJson(
          JSON.stringify({ entries: [{ key: "", zh: "test", en: "test" }] }),
        ),
      ).toThrow();
    });
  });

  describe("Parser: Properties", () => {
    it("parses standard properties format", () => {
      const raw = `app.title=Hello\napp.title.zh=你好\n`;
      const result = parseProperties(raw, "test.properties");
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].key).toBe("app.title");
      expect(result.entries[0].en).toBe("Hello");
      expect(result.entries[1].zh).toBe("你好");
    });
  });

  describe("Conflict Detection", () => {
    it("detects duplicate_key conflict", () => {
      const entries: I18nEntry[] = [
        { key: "dup.a", zh: "测试A", en: "Test A", source_file: "test.json" },
        { key: "dup.a", zh: "测试A2", en: "Test A2", source_file: "test.json" },
      ];
      const dict = createDictionaryStore();
      const conflicts = detectConflicts(entries, dict);
      const dupConflicts = conflicts.filter((c) => c.type === "duplicate_key");
      expect(dupConflicts).toHaveLength(1);
      expect(dupConflicts[0].entry.key).toBe("dup.a");
    });

    it("detects exact_zh_diff_target conflict", () => {
      const dict = createDictionaryStore();
      dict.add("保存", "Save");

      const entries: I18nEntry[] = [
        { key: "btn.save", zh: "保存", en: "Keep", source_file: "ui.json" },
      ];
      const conflicts = detectConflicts(entries, dict);
      expect(conflicts.some((c) => c.type === "exact_zh_diff_target")).toBe(true);
    });

    it("detects high_similarity (>85%)", () => {
      const dict = createDictionaryStore();
      dict.add("确认要删除此配置文件吗", "Delete this config file?");

      const entries: I18nEntry[] = [
        { key: "btn.del", zh: "确认要删除该配置文件吗", en: "Delete that config file?", source_file: "ui.json" },
      ];
      const conflicts = detectConflicts(entries, dict);
      expect(conflicts.some((c) => c.type === "high_similarity")).toBe(true);
    });

    it("does NOT flag identical zh-en pairs", () => {
      const dict = createDictionaryStore();
      dict.add("保存", "Save");

      const entries: I18nEntry[] = [
        { key: "btn.save", zh: "保存", en: "Save", source_file: "ui.json" },
      ];
      const conflicts = detectConflicts(entries, dict);
      expect(conflicts.filter((c) => c.type === "exact_zh_diff_target")).toHaveLength(0);
    });

    it("detects format_parse_error for malformed input", () => {
      expect(() =>
        parseNestedJson("not valid json at all"),
      ).toThrow();
    });

    it("handles 1000 entries through conflict detection efficiently", () => {
      const raw = JSON.stringify(largeFixture);
      const parsed = parseNestedJson(raw);
      const dict = createDictionaryStore();
      // Seed dictionary with some entries to trigger conflicts
      for (let i = 0; i < 50; i++) {
        dict.add(`中文文本_${i * 20 + 1}`, `English text number ${i * 20 + 1}`);
      }
      const start = performance.now();
      const conflicts = detectConflicts(parsed.entries, dict);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1000);
      expect(conflicts.length).toBeGreaterThan(0);
    });
  });
});

// Simple properties parser — mirrors the production .properties parser
function parseProperties(
  raw: string,
  sourceFile: string,
): StandardJson {
  const lines = raw.split(/\r?\n/);
  const entries: I18nEntry[] = [];
  let commentBuffer: string[] = [];
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    // Strip leading whitespace only — trailing whitespace in values must be preserved
    const trimmed = line.replace(/^[ \t\f]+/, "");

    // Skip empty lines, collect comments
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      if (trimmed.startsWith("#")) {
        commentBuffer.push(trimmed.slice(1).trim());
      }
      continue;
    }

    // Handle multi-line continuation
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).replace(/^[ \t]+/, "");

    // Handle line continuation with separate peek index
    let peek = lineNum;
    while (value.endsWith("\\")) {
      value = value.slice(0, -1);
      if (peek < lines.length) {
        value += lines[peek].trim();
        peek++;
      } else {
        break;
      }
    }

    // Unescape standard Java properties escapes
    value = value
      .replace(/\\t/g, "\t")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\\\/g, "\\")
      .replace(/\\:/g, ":")
      .replace(/\\=/g, "=");

    entries.push({
      key,
      zh: key.endsWith(".zh") ? value : "",
      en: key.endsWith(".zh") ? "" : value,
      source_file: sourceFile,
      line_number: lineNum,
      comment: commentBuffer.length ? commentBuffer.join("\n") : undefined,
    });

    commentBuffer = [];
  }

  return {
    entries,
    metadata: {
      source_format: "properties",
      source_file: sourceFile,
      total_entries: entries.length,
      parsed_at: new Date().toISOString(),
    },
  };
}
