import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { StandardJson, I18nEntry, Conflict } from "@/types";

/**
 * Boundary tests for .properties file parsing.
 *
 * Covers: Unicode escapes, multi-line values, special characters,
 * empty values, comments, duplicate keys, leading/trailing whitespace.
 *
 * Fixture: tests/fixtures/edge-case.properties
 */

// Reuse the properties parser from integration tests
function parseProperties(
  raw: string,
  sourceFile: string,
): StandardJson {
  const lines = raw.split(/\r?\n/);
  const entries: I18nEntry[] = [];
  const commentBuffer: string[] = [];
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    // Strip leading whitespace only — trailing whitespace in values must be preserved
    const trimmed = line.replace(/^[ \t\f]+/, "");

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      if (trimmed.startsWith("#")) {
        commentBuffer.push(trimmed.slice(1).trim());
      }
      continue;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).replace(/^[ \t]+/, "");

    // Multi-line continuation — use a separate peek index to avoid
    // corrupting the outer for-loop's lineNum (consumed lines have no '=',
    // so they get skipped naturally by the eqIdx check above).
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

    // Unescape
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

    commentBuffer.length = 0;
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

describe("Boundary: Properties Parser", () => {
  const fixturePath = resolve(__dirname, "../fixtures/edge-case.properties");
  const raw = readFileSync(fixturePath, "utf-8");
  const parsed = parseProperties(raw, "edge-case.properties");

  it("preserves Unicode characters (Chinese, emoji, accented latin)", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    expect(byKey.get("chinese.direct")?.en).toBe("你好，世界！");
    expect(byKey.get("mixed.unicode")?.en).toBe("Café résumé naïve");
    expect(byKey.get("emoji.greeting")?.en).toBe("😀 Hello! 🎉");
  });

  it("handles multi-line continuation", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    const multiline = byKey.get("multiline.description");
    expect(multiline).toBeDefined();
    expect(multiline?.en).toContain("long description");
    expect(multiline?.en).toContain("third line");
  });

  it("handles multi-line with embedded newlines", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    const address = byKey.get("multiline.address");
    expect(address).toBeDefined();
    expect(address?.en).toContain("Line 1");
    expect(address?.en).toContain("Line 3");
  });

  it("handles empty values", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    const empty = byKey.get("empty.field");
    expect(empty).toBeDefined();
    expect(empty?.en).toBe("");
  });

  it("handles explicit (empty) marker", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    const explicit = byKey.get("explicit.empty");
    expect(explicit).toBeDefined();
    expect(explicit?.en).toBe("(empty)");
  });

  it("handles special characters: tab, CRLF, backslash, equals, colon, hash, bang", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    expect(byKey.get("special.tab")?.en).toContain("Column1");
    // \t in value is a real tab per Java Properties spec;
    // backslashes remain literal (only \\ becomes \)
    const backslashVal = byKey.get("special.backslash")?.en ?? "";
    expect(backslashVal).toContain("Users");
    // \test becomes <tab>est
    expect(backslashVal).toContain("\test");
    expect(backslashVal).toContain("path");
    expect(byKey.get("special.equals")?.en).toBe("key=value=pair");
    expect(byKey.get("special.colon")?.en).toBe("time: 12:00:00");
    expect(byKey.get("special.hash")?.en).toBe("This is not a # comment");
    expect(byKey.get("special.bang")?.en).toBe("Important! Do not remove!");
  });

  it("detects duplicate keys (dup.key1 appears twice)", () => {
    const keyCounts = new Map<string, number>();
    for (const e of parsed.entries) {
      keyCounts.set(e.key, (keyCounts.get(e.key) || 0) + 1);
    }
    expect(keyCounts.get("dup.key1")).toBe(2);
    expect(keyCounts.get("dup.key2")).toBe(2);
    expect(keyCounts.get("dup.key3")).toBe(1);
  });

  it("preserves trailing whitespace in values", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    // Per Java Properties spec, leading whitespace after = is stripped
    const trailing = byKey.get(".trim.test.2");
    expect(trailing?.en).toMatch(/\s+$/);
    // Leading whitespace is stripped per spec
    const leading = byKey.get(".trim.test.1");
    expect(leading?.en).toBe("leading spaces");
  });

  it("handles very long values", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    const longVal = byKey.get("long.value");
    expect(longVal).toBeDefined();
    expect(longVal?.en!.length).toBeGreaterThan(200);
  });

  it("handles keys with dots (nested-like)", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    expect(byKey.get("nested.like.json.key")).toBeDefined();
  });

  it("preserves comments for entries", () => {
    const withComments = parsed.entries.filter((e) => e.comment);
    expect(withComments.length).toBeGreaterThan(0);
  });

  it("handles null-like value = null as literal string", () => {
    const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
    expect(byKey.get("null.like")?.en).toBe("null");
  });
});

describe("Boundary: Key collisions between Dictionary", () => {
  function similarityRatio(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!a.length || !b.length) return 0.0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }
    return matches / longer.length;
  }

  it("finds high similarity for strings differing only by punctuation", () => {
    const ratio = similarityRatio("保存文件", "保存文件！");
    expect(ratio).toBeGreaterThan(0.75);
  });

  it("finds high similarity for traditional vs simplified hint", () => {
    // Same chars, minor variation
    const ratio = similarityRatio("数据加载中", "数据加载中...");
    expect(ratio).toBeGreaterThan(0.6);
  });

  it("does NOT flag completely different strings", () => {
    const ratio = similarityRatio("保存文件", "删除项目");
    expect(ratio).toBeLessThan(0.5);
  });

  it("handles empty strings in similarity check", () => {
    expect(similarityRatio("", "test")).toBe(0.0);
    expect(similarityRatio("test", "")).toBe(0.0);
  });

  it("handles identical strings", () => {
    expect(similarityRatio("保存", "保存")).toBe(1.0);
  });
});

describe("Boundary: Character encoding", () => {
  it("handles full-width and half-width characters", () => {
    const raw = "label=ＡＢＣＤＥ\nlabel.zh=ABCDE\n";
    const result = parseProperties(raw, "test.properties");
    expect(result.entries[0].en).toBe("ＡＢＣＤＥ");
    expect(result.entries[1].zh).toBe("ABCDE");
  });

  it("survives BOM in UTF-8 file", () => {
    const raw = "﻿app.title=Hello\n";
    const result = parseProperties(raw, "test.properties");
    expect(result.entries[0].key).toContain("app.title");
  });

  it("handles mixed CJK and ASCII in same value", () => {
    const raw = "mixed=中文Chineseにほんご\n";
    const result = parseProperties(raw, "test.properties");
    expect(result.entries[0].en).toBe("中文Chineseにほんご");
  });

  it("handles values with only whitespace (leading trimmed per spec)", () => {
    const raw = "space.key=   \n";
    const result = parseProperties(raw, "test.properties");
    // Per Java Properties spec, leading whitespace after = is stripped,
    // leaving empty string for whitespace-only values.
    expect(result.entries[0].en).toBe("");
  });
});
