import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import {
  isDatabaseUnavailable,
  saveLocalTaskToDictionary,
  unresolvedBlockingConflicts,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { chineseHash, normalizeText } from "@/lib/standard";
import type { PreviewRow } from "@/domain/standard-i18n/types";

function sameNormalizedText(left: string, right: string) {
  return normalizeText(left) === normalizeText(right);
}

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const body = await request.json();
  const snapshotVersion = Number(body.snapshotVersion);
  if (!snapshotVersion) return fail("snapshotVersion is required", 400);

  try {
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
      const seenHashes = new Set<string>();
      for (const row of rows) {
        const chineseText = row.sourceValue?.trim();
        const englishText = row.translatedValue?.trim();
        if (!chineseText || !englishText) {
          skipped++;
          continue;
        }

        const hash = chineseHash(chineseText);
        if (seenHashes.has(hash)) {
          skipped++;
          continue;
        }
        seenHashes.add(hash);

        const existing = await tx.dictionary.findUnique({ where: { chineseHash: hash } });

        if (!existing) {
          const entry = await tx.dictionary.create({
            data: {
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
              previousEnglish: null,
              nextEnglish: englishText,
              reason: "task save",
              changedById: body.changedById ?? null,
            },
          });
          created++;
          continue;
        }

        if (sameNormalizedText(existing.englishText, englishText)) {
          skipped++;
          continue;
        }

        const entry = await tx.dictionary.update({
          where: { chineseHash: hash },
          data: {
            chineseText,
            normalizedChinese: normalizeText(chineseText),
            englishText,
            normalizedEnglish: normalizeText(englishText),
            usageCount: { increment: 1 },
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
        updated++;
      }

      await tx.dictionaryConflict.updateMany({
        where: { taskId, resolvedAt: null },
        data: { resolvedAt: new Date(), resolution: "UPDATE_DICTIONARY" },
      });

      const task = await tx.translationTask.update({
        where: { id: taskId },
        data: { dictionarySyncedAt: new Date() },
      });

      return { task, snapshot };
    });

    return ok({
      ...result,
      dictionarySync: { created, updated, skipped },
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("task save failed", 500, error instanceof Error ? error.message : String(error));
    }
    const conflicts = unresolvedBlockingConflicts(taskId);
    if (conflicts.length > 0 && !body.resolutions) {
      return ok({ conflicts, localFallback: true }, 409);
    }
    try {
      return ok({ ...saveLocalTaskToDictionary(taskId, snapshotVersion), localFallback: true });
    } catch (localError) {
      const message = localError instanceof Error ? localError.message : String(localError);
      return fail(message, message === "snapshot not found" ? 404 : 500);
    }
  }
}
