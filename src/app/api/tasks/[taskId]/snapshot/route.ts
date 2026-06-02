import { NextRequest } from "next/server";
import { Prisma, SnapshotKind, TaskStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { createLocalSnapshot, getLocalCurrentRows, isDatabaseUnavailable } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { draftRowsToPreviewRows } from "@/lib/standard";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const body = await request.json();
  const baseVersion = Number(body.baseVersion);
  if (!baseVersion) return fail("baseVersion is required", 400);

  try {
    const task = await prisma.translationTask.findUnique({ where: { id: taskId } });
    if (!task) return fail("task not found", 404);
    if (task.status !== TaskStatus.DRAFT || !task.isEditable) {
      return fail("task is not draft editable", 409);
    }
    if (task.latestVersion !== baseVersion) {
      return fail("snapshot version conflict", 409, { expected: task.latestVersion, actual: baseVersion });
    }

    const latest = await prisma.taskSnapshot.findFirst({ where: { taskId }, orderBy: { version: "desc" } });
    const draftRows = await prisma.taskDraftRow.findMany({ where: { taskId }, orderBy: { rowIndex: "asc" } });
    const previewRows = draftRows.length > 0
      ? draftRowsToPreviewRows(draftRows)
      : ((latest?.previewRows ?? []) as unknown[]);
    const nextVersion = baseVersion + 1;
    const result = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.taskSnapshot.create({
        data: {
          taskId,
          version: nextVersion,
          kind: SnapshotKind.SAVED,
          standardDocuments: (latest?.standardDocuments ?? {}) as Prisma.InputJsonValue,
          previewRows: previewRows as Prisma.InputJsonValue,
          conflictSummary: (latest?.conflictSummary ?? {}) as Prisma.InputJsonValue,
        },
      });
      const savedTask = await tx.translationTask.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.SAVED,
          isEditable: false,
          latestVersion: nextVersion,
          savedAt: new Date(),
        },
      });
      await tx.taskDraftRow.deleteMany({ where: { taskId } });
      return { snapshot, task: savedTask };
    });

    return ok(result);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("snapshot create failed", 500, error instanceof Error ? error.message : String(error));
    }
    try {
      const result = createLocalSnapshot({ taskId, baseVersion, rows: getLocalCurrentRows(taskId), kind: "SAVED" });
      return ok({ ...result, localFallback: true });
    } catch (localError) {
      const anyError = localError as Error & { expected?: number; actual?: number };
      if (anyError.message === "snapshot version conflict") {
        return fail(anyError.message, 409, { expected: anyError.expected, actual: anyError.actual });
      }
      return fail(anyError.message, anyError.message === "task not found" ? 404 : 500);
    }
  }
}
