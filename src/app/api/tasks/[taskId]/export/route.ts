import { NextRequest } from "next/server";
import { exportToJson } from "@/domain/exporter/json-exporter";
import { exportToProperties } from "@/domain/exporter/properties-exporter";
import { validateDocument } from "@/domain/persistence/save-service";
import type { PreviewRow, StandardI18nDocument } from "@/domain/standard-i18n/types";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rowsToDocument } from "@/lib/standard";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const body = await request.json();
  const snapshotVersion = Number(body.snapshotVersion);
  if (!snapshotVersion) return fail("snapshotVersion is required", 400);

  const snapshot = await prisma.taskSnapshot.findUnique({
    where: { taskId_version: { taskId, version: snapshotVersion } },
  });
  if (!snapshot) return fail("snapshot not found", 404);

  const docs = snapshot.standardDocuments as { source?: StandardI18nDocument } | null;
  const rows = snapshot.previewRows as unknown as PreviewRow[];
  if (!docs?.source) return fail("source document missing", 422);

  const document = rowsToDocument(rows, docs.source);
  const validation = validateDocument(document);
  if (!validation.valid) return ok({ valid: false, validationErrors: validation.errors }, 422);

  const content = document.sourceFormat === "properties"
    ? exportToProperties(document, { dictionaryPriority: true })
    : exportToJson(document, { dictionaryPriority: true });
  const files = { [document.sourceName]: content };
  return ok({ files, fileBaseName: body.fileBaseName ?? document.sourceName });
}
