import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  clearLocalDictionaries: vi.fn(),
  clearLocalProjects: vi.fn(),
  clearLocalSnapshots: vi.fn(),
  resetLocalSnapshotsAndDictionaries: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/local-store", () => ({
  clearLocalDictionaries: mocks.clearLocalDictionaries,
  clearLocalProjects: mocks.clearLocalProjects,
  clearLocalSnapshots: mocks.clearLocalSnapshots,
  resetLocalSnapshotsAndDictionaries: mocks.resetLocalSnapshotsAndDictionaries,
  isDatabaseUnavailable: () => true,
}));

function dbUnavailable() {
  const error = new Error("database unavailable") as Error & { code?: string };
  error.code = "P1001";
  return error;
}

describe("settings maintenance API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockRejectedValue(dbUnavailable());
    mocks.clearLocalDictionaries.mockReturnValue({ dictionaries: 2, dictionaryRevisions: 0 });
    mocks.clearLocalSnapshots.mockReturnValue({ snapshots: 3, snapshotConflicts: 1 });
    mocks.resetLocalSnapshotsAndDictionaries.mockReturnValue({
      snapshots: 3,
      snapshotConflicts: 1,
      dictionaries: 2,
      dictionaryRevisions: 0,
    });
    mocks.clearLocalProjects.mockReturnValue({
      projects: 1,
      tasks: 2,
      draftRows: 4,
      projectConflicts: 5,
    });
  });

  it("reset-system keeps projects by default", async () => {
    const { POST } = await import("@/app/api/settings/maintenance/route");
    const request = new Request("http://localhost/api/settings/maintenance", {
      method: "POST",
      body: JSON.stringify({ action: "reset-system" }),
    }) as Parameters<typeof POST>[0];
    const response = await POST(request);
    const body = await response.json();

    expect(body.storage).toBe("memory");
    expect(body.clearProjects).toBe(false);
    expect(body.counts).toMatchObject({ snapshots: 3, dictionaries: 2 });
    expect(mocks.resetLocalSnapshotsAndDictionaries).toHaveBeenCalledTimes(1);
    expect(mocks.clearLocalProjects).not.toHaveBeenCalled();
  });

  it("reset-system clears projects when requested", async () => {
    const { POST } = await import("@/app/api/settings/maintenance/route");
    const request = new Request("http://localhost/api/settings/maintenance", {
      method: "POST",
      body: JSON.stringify({ action: "reset-system", clearProjects: true }),
    }) as Parameters<typeof POST>[0];
    const response = await POST(request);
    const body = await response.json();

    expect(body.storage).toBe("memory");
    expect(body.clearProjects).toBe(true);
    expect(body.counts).toMatchObject({
      snapshots: 3,
      dictionaries: 2,
      projects: 1,
      tasks: 2,
      draftRows: 4,
      projectConflicts: 5,
    });
    expect(mocks.clearLocalProjects).toHaveBeenCalledTimes(1);
  });
});
