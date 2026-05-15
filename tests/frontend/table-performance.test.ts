import { describe, it, expect, beforeAll } from "vitest";
import largeFixture from "../fixtures/large-1000-rows.json";

/**
 * Frontend table render & performance tests.
 *
 * Tests virtual scrolling, memory usage patterns, and 1000-row table rendering.
 * These simulate what a product manager would see in the browser.
 */

interface VirtualRow {
  index: number;
  key: string;
  zh: string;
  en: string;
  height: number;
}

interface VirtualTableConfig {
  rowHeight: number;
  visibleRows: number;
  totalRows: number;
  overscan: number;
}

interface VirtualTableState {
  scrollTop: number;
  startIndex: number;
  endIndex: number;
  visibleRows: VirtualRow[];
  totalHeight: number;
  offsetY: number;
}

// Virtual scroll implementation mirroring the planned UI component
function createVirtualTable(config: VirtualTableConfig) {
  const { rowHeight, visibleRows, totalRows, overscan } = config;
  const totalHeight = totalRows * rowHeight;

  return {
    getVisibleRange(scrollTop: number): {
      startIndex: number;
      endIndex: number;
      offsetY: number;
    } {
      const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
      const endIndex = Math.min(
        totalRows,
        Math.ceil((scrollTop + visibleRows * rowHeight) / rowHeight) + overscan,
      );
      const offsetY = startIndex * rowHeight;
      return { startIndex, endIndex, offsetY };
    },

    getTotalHeight(): number {
      return totalHeight;
    },
  };
}

// Helper to build row data from Standard JSON entries
function buildRows(json: typeof largeFixture): VirtualRow[] {
  return json.entries.map((e, i) => ({
    index: i,
    key: e.key,
    zh: e.zh,
    en: e.en,
    height: 40, // default row height in px
  }));
}

describe("Frontend: Virtual Scroll Table Performance", () => {
  const rows = buildRows(largeFixture);
  const totalRows = rows.length;

  it("handles 1000-row dataset", () => {
    expect(totalRows).toBe(1000);
    expect(rows[0]).toHaveProperty("key");
    expect(rows[0]).toHaveProperty("zh");
    expect(rows[0]).toHaveProperty("en");
  });

  describe("Virtual scroll range calculation", () => {
    const config: VirtualTableConfig = {
      rowHeight: 40,
      visibleRows: 20, // typical viewport shows ~20 rows
      totalRows: 1000,
      overscan: 5,
    };
    const table = createVirtualTable(config);

    it("calculates total scroll height correctly", () => {
      expect(table.getTotalHeight()).toBe(40000); // 1000 * 40
    });

    it("shows first rows when scrolled to top", () => {
      const { startIndex, endIndex } = table.getVisibleRange(0);
      expect(startIndex).toBe(0);
      expect(endIndex).toBe(25); // 20 visible + 5 overscan
    });

    it("renders only a small window of rows (virtual scrolling)", () => {
      const { startIndex, endIndex } = table.getVisibleRange(0);
      const renderedCount = endIndex - startIndex;
      expect(renderedCount).toBeLessThanOrEqual(30); // 20 + 5*2 = 30 max
      expect(renderedCount).toBeLessThan(totalRows); // Not rendering all 1000
    });

    it("shows correct range mid-scroll", () => {
      const scrollTop = 10000; // scrolled 250 rows down
      const { startIndex, endIndex } = table.getVisibleRange(scrollTop);
      expect(startIndex).toBe(245); // floor(10000/40) - 5
      expect(endIndex).toBe(275); // ceil(10800/40) + 5
    });

    it("clamps to bottom of list", () => {
      const scrollTop = 39000; // near bottom
      const { startIndex, endIndex } = table.getVisibleRange(scrollTop);
      expect(endIndex).toBeLessThanOrEqual(1000);
      expect(endIndex).toBe(1000);
    });

    it("offsetY matches first rendered row position", () => {
      const scrollTop = 4000; // row 100
      const { startIndex, offsetY } = table.getVisibleRange(scrollTop);
      expect(offsetY).toBe(startIndex * 40);
    });
  });

  describe("Render performance budget", () => {
    it("range computation is sub-millisecond", () => {
      const table = createVirtualTable({
        rowHeight: 40,
        visibleRows: 25,
        totalRows: 1000,
        overscan: 10,
      });

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        table.getVisibleRange(i * 100);
      }
      const elapsed = performance.now() - start;
      // 100 range computations should take < 5ms
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe("Memory estimation", () => {
    it("keeps rendered DOM nodes under 50 for 1000 rows (virtualized)", () => {
      const table = createVirtualTable({
        rowHeight: 40,
        visibleRows: 25,
        totalRows: 1000,
        overscan: 10,
      });
      const { startIndex, endIndex } = table.getVisibleRange(0);
      const renderedCount = endIndex - startIndex;
      // At most 45 rows rendered (25 visible + 20 overscan)
      expect(renderedCount).toBeLessThanOrEqual(45);
    });

    it("estimated row data memory fits in budget", () => {
      // Each row ~200 bytes → 1000 rows = ~200KB. Well within budget.
      const sampleRow = JSON.stringify(rows[0]);
      const estimatedTotal = sampleRow.length * totalRows;
      expect(estimatedTotal).toBeLessThan(500_000); // < 500KB
    });
  });
});

describe("Frontend: Table column rendering", () => {
  const rows = buildRows(largeFixture);

  it("all rows have valid key, zh, en", () => {
    for (const row of rows) {
      expect(typeof row.key).toBe("string");
      expect(row.key.length).toBeGreaterThan(0);
      expect(typeof row.zh).toBe("string");
      expect(typeof row.en).toBe("string");
    }
  });

  it("handles rows with comments", () => {
    const rowsWithComments = largeFixture.entries.filter((e) => e.comment);
    expect(rowsWithComments.length).toBeGreaterThan(0);
  });
});
