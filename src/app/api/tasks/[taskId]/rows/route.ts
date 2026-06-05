import { NextRequest } from "next/server";
import { ConflictResolution, ConflictSeverity, TaskStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  isDatabaseUnavailable,
  resolveLocalConflicts,
  summarizeLocalConflictCounts,
  upsertLocalDraftRows,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { chineseHash, normalizeText, type PreviewRowPatch } from "@/lib/standard";

const writableResolutions = new Set<string>([
  ConflictResolution.KEEP_EXISTING,
  ConflictResolution.UPDATE_DICTIONARY,
  ConflictResolution.IGNORE_SIMILAR,
  ConflictResolution.EDIT_ROW,
]);

type ResolvedConflictInput = {
  key: string;
  resolution: ConflictResolution;
};

function parseResolvedConflicts(value: unknown): ResolvedConflictInput[] {
  if (!Array.isArray(value)) return [];

  const items: ResolvedConflictInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { key?: unknown; resolution?: unknown };
    if (typeof item.key !== "string" || item.key.trim().length === 0) continue;
    const resolution =
      typeof item.resolution === "string" && writableResolutions.has(item.resolution)
        ? (item.resolution as ConflictResolution)
        : ConflictResolution.EDIT_ROW;
    items.push({ key: item.key.trim(), resolution });
  }
  return items;
}

function summarizeConflictGroups(
  groups: { severity: ConflictSeverity; _count: { _all: number } }[],
) {
  const counts = { blocking: 0, warning: 0, info: 0, hasBlocking: false };
  for (const group of groups) {
    if (group.severity === ConflictSeverity.BLOCKING) counts.blocking = group._count._all;
    if (group.severity === ConflictSeverity.WARNING) counts.warning = group._count._all;
    if (group.severity === ConflictSeverity.INFO) counts.info = group._count._all;
  }
  counts.hasBlocking = counts.blocking > 0;
  return counts;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const { taskId } = await context.params;
  const body = await request.json();
  const baseVersion = Number(body.baseVersion);
  const rows = body.rows as PreviewRowPatch[];
  const resolvedConflicts = parseResolvedConflicts(body.resolvedConflicts);
  if (!baseVersion || !Array.isArray(rows)) return fail("baseVersion and rows are required", 400);

  try {
    const task = await prisma.translationTask.findUnique({ where: { id: taskId } });
    if (!task) return fail("task not found", 404);
    if (task.status === TaskStatus.DRAFT && task.isEditable && task.createdById !== currentUser.id) {
      return fail("task not found", 404);
    }
    if (task.latestVersion !== baseVersion) {
      return fail("snapshot version conflict", 409, { expected: task.latestVersion, actual: baseVersion });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (resolvedConflicts.length > 0) {
        const resolvedAt = new Date();
        for (const item of resolvedConflicts) {
          await tx.dictionaryConflict.updateMany({
            where: { taskId, candidateKey: item.key, resolvedAt: null },
            data: { resolvedAt, resolution: item.resolution, resolvedById: currentUser.id },
          });
        }
      }

      if (task.status === TaskStatus.DRAFT && task.isEditable) {
        for (const row of rows) {
          const rowKey = (row.rowKey ?? row.key ?? "").trim();
          if (!rowKey) continue;
          await tx.taskDraftRow.upsert({
            where: { taskId_rowKey: { taskId, rowKey } },
            update: {
              ...(typeof row.rowIndex === "number" ? { rowIndex: row.rowIndex } : {}),
              ...(Array.isArray(row.keyPath) ? { keyPath: row.keyPath } : {}),
              ...("sourceValue" in row ? { sourceValue: row.sourceValue ?? null } : {}),
              ...("translatedValue" in row ? { translatedValue: row.translatedValue ?? null } : {}),
              ...(typeof row.status === "string" ? { status: row.status } : {}),
              ...("conflictLevel" in row ? { conflictLevel: row.conflictLevel ?? null } : {}),
            },
            create: {
              taskId,
              rowKey,
              rowIndex: row.rowIndex ?? 0,
              keyPath: row.keyPath ?? [rowKey],
              sourceValue: row.sourceValue ?? null,
              translatedValue: row.translatedValue ?? null,
              status: row.status ?? "NORMAL",
              conflictLevel: row.conflictLevel ?? null,
            },
          });
        }
      } else if (task.status === TaskStatus.SAVED) {
        for (const row of rows) {
          const chineseText = row.sourceValue?.trim();
          const englishText = row.translatedValue?.trim();
          if (!chineseText || !englishText) continue;
          const hash = chineseHash(chineseText);
          const existing = await tx.dictionary.findUnique({ where: { chineseHash: hash } });
          const entry = await tx.dictionary.upsert({
            where: { chineseHash: hash },
            update: {
              englishText,
              normalizedEnglish: normalizeText(englishText),
              updatedById: currentUser.id,
            },
            create: {
              chineseText,
              chineseHash: hash,
              normalizedChinese: normalizeText(chineseText),
              englishText,
              normalizedEnglish: normalizeText(englishText),
              usageCount: 1,
              createdById: currentUser.id,
              updatedById: currentUser.id,
            },
          });
          await tx.dictionaryRevision.create({
            data: {
              dictionaryId: entry.id,
              previousEnglish: existing?.englishText ?? null,
              nextEnglish: englishText,
              reason: "official row update",
              changedById: currentUser.id,
            },
          });
        }
      } else {
        throw new Error("task is not editable");
      }

      const groups = resolvedConflicts.length > 0
        ? await tx.dictionaryConflict.groupBy({
            by: ["severity"],
            where: { taskId, resolvedAt: null },
            _count: { _all: true },
          })
        : [];
      return {
        currentVersion: task.latestVersion,
        conflictSummary: groups.length > 0 ? summarizeConflictGroups(groups) : undefined,
        target: task.status === TaskStatus.SAVED ? "official" : "draft",
      };
    });

    return ok(result);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("row autosave failed", 500, error instanceof Error ? error.message : String(error));
    }
    try {
      upsertLocalDraftRows(taskId, rows);
      if (resolvedConflicts.length > 0) {
        resolveLocalConflicts(taskId, resolvedConflicts, currentUser.id);
        const conflictSummary = summarizeLocalConflictCounts(taskId);
        return ok({ currentVersion: baseVersion, conflictSummary, target: "draft", localFallback: true });
      }
      return ok({ currentVersion: baseVersion, target: "draft", localFallback: true });
    } catch (localError) {
      const anyError = localError as Error & { expected?: number; actual?: number };
      if (anyError.message === "snapshot version conflict") {
        return fail(anyError.message, 409, { expected: anyError.expected, actual: anyError.actual });
      }
      return fail(anyError.message, anyError.message === "task not found" ? 404 : 500);
    }
  }
}
