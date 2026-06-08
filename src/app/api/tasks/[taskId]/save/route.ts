import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  isDatabaseUnavailable,
  saveLocalTaskToDictionary,
  unresolvedBlockingConflicts,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { preClassifyRows, splitCandidates } from "@/lib/dictionary-sync";
import { normalizeText } from "@/lib/standard";
import type { PreviewRow } from "@/domain/standard-i18n/types";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
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
      include: { task: true },
    });
    if (!snapshot) return fail("snapshot not found", 404);
    if (snapshot.task.status === "DRAFT" && snapshot.task.isEditable && snapshot.task.createdById !== currentUser.id) {
      return fail("snapshot not found", 404);
    }

    const rows = snapshot.previewRows as unknown as PreviewRow[];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 阶段一:无 DB 预处理(去重 / 空值 / hash 计算),移出事务以缩短事务窗口。
    const pre = preClassifyRows(rows);
    skipped += pre.skipped;

    const result = await prisma.$transaction(
      async (tx) => {
        const hashes = [...pre.candidates.keys()];

        // 1 次批量查已存在,替代原来逐行的 N 次 findUnique。
        const existingRows = hashes.length === 0
          ? []
          : await tx.dictionary.findMany({
              where: { chineseHash: { in: hashes } },
              select: { id: true, chineseHash: true, englishText: true },
            });
        const existing = new Map(
          existingRows.map((row) => [row.chineseHash, { englishText: row.englishText }]),
        );

        const { creates, updates, skippedSameEnglish } = splitCandidates(pre.candidates, existing);
        skipped += skippedSameEnglish;

        // 批量新建 + 直接拿回插入行(含 db 生成 id),用于写 revision。
        if (creates.length > 0) {
          const inserted = await tx.dictionary.createManyAndReturn({
            data: creates.map((candidate) => ({
              chineseText: candidate.chineseText,
              chineseHash: candidate.hash,
              normalizedChinese: normalizeText(candidate.chineseText),
              englishText: candidate.englishText,
              normalizedEnglish: normalizeText(candidate.englishText),
              usageCount: 1,
              createdById: currentUser.id,
              updatedById: currentUser.id,
            })),
            skipDuplicates: true, // 并发下若别人已插入相同 chineseHash 则跳过,避免 P2002 回滚整个事务
            select: { id: true, englishText: true },
          });
          created += inserted.length; // 精确:只数真正插入的行
          if (inserted.length > 0) {
            await tx.dictionaryRevision.createMany({
              data: inserted.map((entry) => ({
                dictionaryId: entry.id,
                previousEnglish: null,
                nextEnglish: entry.englishText,
                reason: "task save",
                changedById: currentUser.id,
              })),
            });
          }
        }

        // 更新分支:中文同英文不同。导入时已被标为 BLOCKING 冲突并在 save 前强制解决,
        // 正常流程几乎走不到(~1-5%,仅并发竞态),故保持逐条,不批量化。
        for (const { candidate, previousEnglish } of updates) {
          const entry = await tx.dictionary.update({
            where: { chineseHash: candidate.hash },
            data: {
              chineseText: candidate.chineseText,
              normalizedChinese: normalizeText(candidate.chineseText),
              englishText: candidate.englishText,
              normalizedEnglish: normalizeText(candidate.englishText),
              usageCount: { increment: 1 },
              updatedById: currentUser.id,
            },
          });
          await tx.dictionaryRevision.create({
            data: {
              dictionaryId: entry.id,
              previousEnglish,
              nextEnglish: candidate.englishText,
              reason: "task save",
              changedById: currentUser.id,
            },
          });
          updated++;
        }

        await tx.dictionaryConflict.updateMany({
          where: { taskId, resolvedAt: null },
          data: { resolvedAt: new Date(), resolution: "UPDATE_DICTIONARY", resolvedById: currentUser.id },
        });

        const task = await tx.translationTask.update({
          where: { id: taskId },
          data: { dictionarySyncedAt: new Date() },
        });

        return { task, snapshot };
      },
      // 批量化后正常仅几百毫秒;30s 作为覆盖慢 DB / 锁等待 / update 长尾的安全网。
      { maxWait: 5_000, timeout: 30_000 },
    );


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
      return ok({ ...saveLocalTaskToDictionary(taskId, snapshotVersion, currentUser.id), localFallback: true });
    } catch (localError) {
      const message = localError instanceof Error ? localError.message : String(localError);
      return fail(message, message === "snapshot not found" ? 404 : 500);
    }
  }
}
