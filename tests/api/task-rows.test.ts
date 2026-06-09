import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictResolution, ConflictSeverity, TaskStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findTask: vi.fn(),
  updateMany: vi.fn(),
  groupBy: vi.fn(),
  upsertDraftRow: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    translationTask: {
      findUnique: mocks.findTask,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    response: null,
    user: { id: "user-1", username: "alice", role: "MAINTAINER", tokenVersion: 1 },
  })),
}));

vi.mock("@/lib/local-store", () => ({
  isDatabaseUnavailable: () => false,
  resolveLocalConflicts: vi.fn(),
  summarizeLocalConflictCounts: vi.fn(),
  upsertLocalDraftRows: vi.fn(),
}));

describe("task rows API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTask.mockResolvedValue({
      id: "task-1",
      status: TaskStatus.DRAFT,
      isEditable: true,
      createdById: "user-1",
      latestVersion: 1,
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.groupBy.mockResolvedValue([
      { severity: ConflictSeverity.BLOCKING, _count: { _all: 0 } },
    ]);
    mocks.transaction.mockImplementation(async (callback, _options) => callback({
      dictionaryConflict: {
        updateMany: mocks.updateMany,
        groupBy: mocks.groupBy,
      },
      taskDraftRow: {
        upsert: mocks.upsertDraftRow,
      },
    }));
  });

  it("batches resolved conflicts by resolution and extends transaction timeout", async () => {
    const { PATCH } = await import("@/app/api/tasks/[taskId]/rows/route");
    const request = new Request("http://localhost/api/tasks/task-1/rows", {
      method: "PATCH",
      body: JSON.stringify({
        baseVersion: 1,
        rows: [],
        resolvedConflicts: [
          { key: "a", resolution: ConflictResolution.UPDATE_DICTIONARY },
          { key: "b", resolution: ConflictResolution.UPDATE_DICTIONARY },
          { key: "c", resolution: ConflictResolution.KEEP_EXISTING },
        ],
      }),
    }) as Parameters<typeof PATCH>[0];

    const response = await PATCH(request, { params: Promise.resolve({ taskId: "task-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ maxWait: 5_000, timeout: 30_000 });
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: "task-1", candidateKey: { in: ["a", "b"] }, resolvedAt: null },
      data: expect.objectContaining({ resolution: ConflictResolution.UPDATE_DICTIONARY }),
    }));
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: "task-1", candidateKey: { in: ["c"] }, resolvedAt: null },
      data: expect.objectContaining({ resolution: ConflictResolution.KEEP_EXISTING }),
    }));
  });
});
