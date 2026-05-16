import { NextRequest } from "next/server";
import { Prisma, SnapshotKind, TaskStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { chineseHash, normalizeText } from "@/lib/standard";
import type { PreviewRow } from "@/domain/standard-i18n/types";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const body = await request.json();
  const snapshotVersion = Number(body.snapshotVersion);
  if (!snapshotVersion) return fail("snapshotVersion is required", 400);

  const unresolvedBlocking = await prisma.dictionaryConflict.findMany({
    where: { taskId, severity: "BLOCKING", resolvedAt: null },
  });
  if (unresolvedBlocking.length > 0 && !body.resolutions) {
    return ok({ conflicts: unresolvedBlocking }, 409);
  }

  const snapshot = await prisma.taskSnapshot.findUnique({
    where: { taskId_version: { taskId, version: snapshotVersion } },
  });
  if (!snapshot) return fail("snapshot not found", 404);

  const rows = snapshot.previewRows as unknown as PreviewRow[];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const result = await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const chineseText = row.sourceValue?.trim();
      const englishText = row.translatedValue?.trim();
      if (!chineseText || !englishText) {
        skipped++;
        continue;
      }

      const hash = chineseHash(chineseText);
      const existing = await tx.dictionary.findUnique({ where: { chineseHash: hash } });
      const entry = await tx.dictionary.upsert({
        where: { chineseHash: hash },
        update: {
          englishText,
          normalizedEnglish: normalizeText(englishText),
          usageCount: { increment: 1 },
        },
        create: {
          chineseText,
          chineseHash: hash,
          normalizedChinese: normalizeText(chineseText),
          englishText,
          normalizedEnglish: normalizeText(englishText),
          usageCount: 1,
        },
      });

      await tx.dictionaryRevision.create({
        data: {
          dictionaryId: entry.id,
          previousEnglish: existing?.englishText ?? null,
          nextEnglish: englishText,
          reason: "task save",
          changedById: body.changedById ?? null,
        },
      });

      existing ? updated++ : created++;
    }

    await tx.dictionaryConflict.updateMany({
      where: { taskId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolution: "UPDATE_DICTIONARY" },
    });

    const savedSnapshot = await tx.taskSnapshot.create({
      data: {
        taskId,
        version: snapshotVersion + 1,
        kind: SnapshotKind.SAVED,
        standardDocuments: snapshot.standardDocuments ?? {},
        previewRows: rows as unknown as Prisma.InputJsonValue,
        conflictSummary: (snapshot.conflictSummary ?? {}) as Prisma.InputJsonValue,
      },
    });

    const task = await tx.translationTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.SAVED,
        isEditable: false,
        latestVersion: snapshotVersion + 1,
        savedAt: new Date(),
      },
    });

    return { task, snapshot: savedSnapshot };
  });

  return ok({
    ...result,
    dictionarySync: { created, updated, skipped },
  });
}
