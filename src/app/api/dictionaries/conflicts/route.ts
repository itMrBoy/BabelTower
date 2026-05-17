import { NextRequest } from "next/server";
import { detectConflicts } from "@/domain/conflict/conflict-detector";
import { fail, ok } from "@/lib/api";
import { getLocalDictionaryEntriesForConflict, isDatabaseUnavailable } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { dictionaryToStandardEntry } from "@/lib/standard";
import type { StandardI18nEntry } from "@/domain/standard-i18n/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const entries = body.entries as StandardI18nEntry[] | undefined;
  if (!Array.isArray(entries)) return fail("entries array is required", 400);

  try {
    const dictionary = await prisma.dictionary.findMany({ take: 5000 });
    const conflictSummary = detectConflicts(entries, dictionary.map(dictionaryToStandardEntry));
    return ok({ conflictSummary });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const conflictSummary = detectConflicts(entries, getLocalDictionaryEntriesForConflict());
      return ok({ conflictSummary, localFallback: true });
    }
    return fail("dictionary conflict check failed", 500, error instanceof Error ? error.message : String(error));
  }
}
