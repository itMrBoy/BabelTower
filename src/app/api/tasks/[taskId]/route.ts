import { fail, ok } from "@/lib/api";
import {
  getLatestLocalSnapshot,
  getLocalCurrentRows,
  getLocalTask,
  initializeLocalDraftRowsFromSnapshot,
  isDatabaseUnavailable,
} from "@/lib/local-store";
import type { PreviewRow } from "@/domain/standard-i18n/types";
import { prisma } from "@/lib/prisma";
import { draftRowsToPreviewRows, previewRowToDraftData } from "@/lib/standard";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  try {
    const task = await prisma.translationTask.findUnique({ where: { id: taskId } });
    if (!task) return fail("task not found", 404);
    const latestSnapshot = await prisma.taskSnapshot.findFirst({
      where: { taskId },
      orderBy: { version: "desc" },
    });
    let draftRows = await prisma.taskDraftRow.findMany({ where: { taskId }, orderBy: { rowIndex: "asc" } });
    if (draftRows.length === 0 && task.status === "DRAFT" && task.isEditable && latestSnapshot) {
      await prisma.taskDraftRow.createMany({
        data: (latestSnapshot.previewRows as unknown as PreviewRow[]).map((row, rowIndex) => ({
          taskId,
          ...previewRowToDraftData(row, rowIndex),
        })),
      });
      draftRows = await prisma.taskDraftRow.findMany({ where: { taskId }, orderBy: { rowIndex: "asc" } });
    }
    const previewRows = draftRows.length > 0
      ? draftRowsToPreviewRows(draftRows)
      : ((latestSnapshot?.previewRows ?? []) as unknown as PreviewRow[]);
    return ok({ task, latestSnapshot, previewRows });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const task = getLocalTask(taskId);
      if (!task) return fail("task not found", 404);
      initializeLocalDraftRowsFromSnapshot(taskId);
      return ok({
        task,
        latestSnapshot: getLatestLocalSnapshot(taskId),
        previewRows: getLocalCurrentRows(taskId),
        localFallback: true,
      });
    }
    return fail("task detail failed", 500, error instanceof Error ? error.message : String(error));
  }
}
