import { NextRequest } from "next/server";
import { ConflictSeverity } from "@prisma/client";
import { validateDocument } from "@/domain/persistence/save-service";
import type { PreviewRow, StandardI18nDocument } from "@/domain/standard-i18n/types";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rowsToDocument } from "@/lib/standard";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const body = await request.json();
  const version = Number(body.snapshotVersion);
  if (!version) return fail("snapshotVersion is required", 400);

  const snapshot = await prisma.taskSnapshot.findUnique({ where: { taskId_version: { taskId, version } } });
  if (!snapshot) return fail("snapshot not found", 404);

  const docs = snapshot.standardDocuments as { source?: StandardI18nDocument } | null;
  const rows = snapshot.previewRows as unknown as PreviewRow[];
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
}
