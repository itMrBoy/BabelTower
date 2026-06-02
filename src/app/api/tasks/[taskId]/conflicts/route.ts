import { NextRequest } from "next/server";
import { ConflictSeverity, ConflictType } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { isDatabaseUnavailable, listLocalTaskConflicts } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

type TaskConflictRow = {
  id: string;
  type: ConflictType | "DUPLICATE_IDENTICAL" | "EXACT_CHINESE_DIFF_ENGLISH" | "SIMILAR_CHINESE";
  severity: ConflictSeverity | "INFO" | "WARNING" | "BLOCKING";
  candidateKey: string | null;
  candidateChineseText: string;
  candidateEnglishText: string | null;
  existingChineseText: string | null;
  existingEnglishText: string | null;
  similarity: number | null;
  reason: string;
  resolvedAt: Date | null;
  createdAt: Date;
};

function toApiConflict(row: TaskConflictRow) {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    key: row.candidateKey ?? "",
    keyPath: row.candidateKey ? row.candidateKey.split(".") : [],
    chineseValue: row.candidateChineseText,
    existingChinese: row.existingChineseText ?? "",
    existingEnglish: row.existingEnglishText ?? "",
    newEnglish: row.candidateEnglishText ?? "",
    similarity: row.similarity,
    reason: row.reason,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

function summarize(rows: TaskConflictRow[]) {
  const blocking = rows.filter((row) => row.severity === "BLOCKING").length;
  const warning = rows.filter((row) => row.severity === "WARNING").length;
  const info = rows.filter((row) => row.severity === "INFO").length;
  return { blocking, warning, info, hasBlocking: blocking > 0 };
}

export async function GET(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const { searchParams } = new URL(request.url);
  const unresolvedOnly = searchParams.get("unresolvedOnly") !== "false";

  try {
    const rows = await prisma.dictionaryConflict.findMany({
      where: {
        taskId,
        ...(unresolvedOnly ? { resolvedAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return ok({ items: rows.map(toApiConflict), conflictSummary: summarize(rows) });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const rows = listLocalTaskConflicts(taskId, unresolvedOnly);
      return ok({
        items: rows.map(toApiConflict),
        conflictSummary: summarize(rows),
        localFallback: true,
      });
    }
    return fail("task conflicts failed", 500, error instanceof Error ? error.message : String(error));
  }
}
