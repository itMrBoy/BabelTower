import { NextRequest } from "next/server";
import { ConflictSeverity } from "@prisma/client";
import { validateDocument } from "@/domain/persistence/save-service";
import type { PreviewRow, StandardI18nDocument } from "@/domain/standard-i18n/types";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { countUnresolvedBlocking, getLocalSnapshot, isDatabaseUnavailable } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { draftRowsToPreviewRows, rowsToDocument } from "@/lib/standard";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const { taskId } = await context.params;
  const body = await request.json();
  const version = Number(body.snapshotVersion);
  if (!version) return fail("snapshotVersion is required", 400);

  try {
    const snapshot = await prisma.taskSnapshot.findUnique({
      where: { taskId_version: { taskId, version } },
      include: { task: true },
    });
    if (!snapshot) return fail("snapshot not found", 404);
    if (snapshot.task.status === "DRAFT" && snapshot.task.isEditable && snapshot.task.createdById !== currentUser.id) {
      return fail("snapshot not found", 404);
    }

    const docs = snapshot.standardDocuments as { source?: StandardI18nDocument } | null;
    const draftRows = await prisma.taskDraftRow.findMany({ where: { taskId }, orderBy: { rowIndex: "asc" } });
    const rows = draftRows.length > 0 ? draftRowsToPreviewRows(draftRows) : (snapshot.previewRows as unknown as PreviewRow[]);
    const document = docs?.source ? rowsToDocument(rows, docs.source) : undefined;
    const validation = document ? validateDocument(document) : { valid: false, errors: [{ field: "standardDocuments", message: "source document missing" }] };
    const unresolvedBlocking = await prisma.dictionaryConflict.count({
      where: { taskId, severity: ConflictSeverity.BLOCKING, resolvedAt: null },
    });

    return ok({
      valid: validation.valid && unresolvedBlocking === 0,
      validationErrors: validation.errors,
      unresolvedBlocking,
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("task validation failed", 500, error instanceof Error ? error.message : String(error));
    }
    const snapshot = getLocalSnapshot(taskId, version);
    if (!snapshot) return fail("snapshot not found", 404);
    if (snapshot.createdById !== null && snapshot.createdById !== currentUser.id) return fail("snapshot not found", 404);
    const docs = snapshot.standardDocuments;
    const rows = snapshot.previewRows;
    const document = docs.source ? rowsToDocument(rows, docs.source) : undefined;
    const validation = document ? validateDocument(document) : { valid: false, errors: [{ field: "standardDocuments", message: "source document missing" }] };
    const unresolvedBlocking = countUnresolvedBlocking(taskId);
    return ok({
      valid: validation.valid && unresolvedBlocking === 0,
      validationErrors: validation.errors,
      unresolvedBlocking,
      localFallback: true,
    });
  }
}
