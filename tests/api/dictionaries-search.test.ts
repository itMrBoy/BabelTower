import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  listLocalDictionaries: vi.fn(),
  isDatabaseUnavailable: vi.fn(),
  clearDictionaryQueryCache: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dictionary: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    response: null,
    user: { id: "user-1", username: "alice", role: "USER", tokenVersion: 1 },
  })),
}));

vi.mock("@/lib/local-store", () => ({
  listLocalDictionaries: mocks.listLocalDictionaries,
  isDatabaseUnavailable: mocks.isDatabaseUnavailable,
  // The route imports these even though the GET path does not exercise them.
  findLocalDictionaryByChineseHash: vi.fn(),
  getLocalDictionaryEntriesForConflict: vi.fn(),
  upsertLocalDictionary: vi.fn(),
}));

function makeEntry(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-08T16:59:00Z");
  return {
    id: "dict-1",
    chineseText: "办公安全空间",
    englishText: "Office Security Space",
    tags: [],
    note: null,
    usageCount: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function callGet(query: string, extra = "") {
  const { GET } = await import("@/app/api/dictionaries/route");
  const request = new Request(
    `http://localhost/api/dictionaries?q=${encodeURIComponent(query)}${extra}`,
  ) as Parameters<typeof GET>[0];
  return GET(request);
}

describe("dictionary search API (GET /api/dictionaries)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.isDatabaseUnavailable.mockReturnValue(false);
    mocks.findMany.mockResolvedValue([makeEntry()]);
    // Clear the module-level query cache so each test queries the DB fresh.
    const { clearDictionaryQueryCache } = await import("@/lib/dictionary-query-cache");
    clearDictionaryQueryCache();
  });

  it("uses contains (substring) match, never startsWith — multi-char queries find middle matches", async () => {
    const response = await callGet("安全");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);

    const where = mocks.findMany.mock.calls[0][0].where;
    const json = JSON.stringify(where);
    // The regression guard: "安全" must build a contains clause, not a startsWith one.
    expect(json).toContain("contains");
    expect(json).not.toContain("startsWith");
    expect(body.items[0].chineseText).toBe("办公安全空间");
  });

  it("single-char query also uses contains", async () => {
    await callGet("安");
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("contains");
    expect(JSON.stringify(where)).not.toContain("startsWith");
  });

  it("field=chinese searches only normalizedChinese with contains", async () => {
    await callGet("安全", "&field=chinese");
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      normalizedChinese: { contains: "安全", mode: "insensitive" },
    });
  });

  it("field=english searches only normalizedEnglish with contains", async () => {
    await callGet("security", "&field=english");
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      normalizedEnglish: { contains: "security", mode: "insensitive" },
    });
  });

  it("field=auto searches both columns with contains via OR", async () => {
    await callGet("安全");
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      OR: [
        { normalizedChinese: { contains: "安全", mode: "insensitive" } },
        { normalizedEnglish: { contains: "安全", mode: "insensitive" } },
      ],
    });
  });

  it("returns 400 when q is missing", async () => {
    const { GET } = await import("@/app/api/dictionaries/route");
    const request = new Request("http://localhost/api/dictionaries") as Parameters<typeof GET>[0];
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("serves repeated identical queries from cache (single DB hit)", async () => {
    await callGet("安全");
    await callGet("安全");
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
  });

  it("falls back to local store with contains semantics when the database is unavailable", async () => {
    const dbError = new Error("db down") as Error & { code?: string };
    dbError.code = "P1001";
    mocks.findMany.mockRejectedValueOnce(dbError);
    mocks.isDatabaseUnavailable.mockReturnValue(true);
    mocks.listLocalDictionaries.mockReturnValue([makeEntry()]);

    const response = await callGet("安全");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.localFallback).toBe(true);
    expect(body.items[0].chineseText).toBe("办公安全空间");
    expect(mocks.listLocalDictionaries).toHaveBeenCalledWith(
      expect.objectContaining({ query: "安全", field: "auto" }),
    );
  });
});
