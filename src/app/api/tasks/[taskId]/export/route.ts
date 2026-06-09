import { NextRequest } from "next/server";
import { buildDualExportFiles } from "@/domain/exporter/export-files";
import { validateDocument } from "@/domain/persistence/save-service";
import type { PreviewRow, StandardI18nDocument } from "@/domain/standard-i18n/types";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getLocalCurrentRows, getLocalSnapshot, getLocalTask, isDatabaseUnavailable } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { draftRowsToPreviewRows, rowsToDocument } from "@/lib/standard";

function validateTranslatedRows(rows: PreviewRow[]) {
  return rows
    .filter((row) => !row.translatedValue?.trim())
    .map((row) => ({ field: `entries.${row.key}.translatedValue`, message: "translatedValue is required for target export" }));
}

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const { taskId } = await context.params;
  const body = await request.json();
  const snapshotVersion = Number(body.snapshotVersion);
  if (!snapshotVersion) return fail("snapshotVersion is required", 400);

  try {
    const snapshot = await prisma.taskSnapshot.findUnique({
      where: { taskId_version: { taskId, version: snapshotVersion } },
      include: {
        task: {
          select: {
            targetFilename: true,
            status: true,
            isEditable: true,
            createdById: true,
          },
        },
      },
    });
    if (!snapshot) return fail("snapshot not found", 404);
    if (snapshot.task.status === "DRAFT" && snapshot.task.isEditable && snapshot.task.createdById !== currentUser.id) {
      return fail("snapshot not found", 404);
    }

    const docs = snapshot.standardDocuments as { source?: StandardI18nDocument } | null;
    const draftRows = await prisma.taskDraftRow.findMany({ where: { taskId }, orderBy: { rowIndex: "asc" } });
    const rows = draftRows.length > 0 ? draftRowsToPreviewRows(draftRows) : (snapshot.previewRows as unknown as PreviewRow[]);
    if (!docs?.source) return fail("source document missing", 422);

    const document = rowsToDocument(rows, docs.source);
    const validation = validateDocument(document);
    if (!validation.valid) return ok({ valid: false, validationErrors: validation.errors }, 422);
    const translatedErrors = validateTranslatedRows(rows);
    if (translatedErrors.length > 0) return ok({ valid: false, validationErrors: translatedErrors }, 422);

    const result = buildDualExportFiles(document, snapshot.task.targetFilename);
    return ok({ files: result.files, fileBaseName: body.fileBaseName ?? result.sourceFilename });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("task export failed", 500, error instanceof Error ? error.message : String(error));
    }
    const snapshot = getLocalSnapshot(taskId, snapshotVersion);
    const task = getLocalTask(taskId);
    if (!snapshot) return fail("snapshot not found", 404);
    if (task?.status === "DRAFT" && task.isEditable && task.createdById !== currentUser.id) {
      return fail("snapshot not found", 404);
    }
    const docs = snapshot.standardDocuments;
    const rows = getLocalCurrentRows(taskId);
    if (!docs.source) return fail("source document missing", 422);

    const document = rowsToDocument(rows, docs.source);
    const validation = validateDocument(document);
    if (!validation.valid) return ok({ valid: false, validationErrors: validation.errors, localFallback: true }, 422);
    const translatedErrors = validateTranslatedRows(rows);
    if (translatedErrors.length > 0) {
      return ok({ valid: false, validationErrors: translatedErrors, localFallback: true }, 422);
    }

    const result = buildDualExportFiles(document, task?.targetFilename);
    return ok({ files: result.files, fileBaseName: body.fileBaseName ?? result.sourceFilename, localFallback: true });
  }
}
