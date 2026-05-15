import { NextRequest } from "next/server";
import { detectConflicts } from "@/domain/conflict/conflict-detector";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dictionaryToStandardEntry } from "@/lib/standard";
import type { StandardI18nEntry } from "@/domain/standard-i18n/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const entries = body.entries as StandardI18nEntry[] | undefined;
  if (!Array.isArray(entries)) return fail("entries array is required", 400);

  const dictionary = await prisma.dictionary.findMany({ take: 5000 });
  const conflictSummary = detectConflicts(entries, dictionary.map(dictionaryToStandardEntry));
  return ok({ conflictSummary });
}
