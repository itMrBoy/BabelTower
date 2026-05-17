import { NextRequest } from "next/server";
import { ConflictSeverity, ConflictType } from "@prisma/client";
import { detectConflicts } from "@/domain/conflict/conflict-detector";
import { fail, ok, parseLimit } from "@/lib/api";
import {
  findLocalDictionaryByChineseHash,
  getLocalDictionaryEntriesForConflict,
  isDatabaseUnavailable,
  listLocalDictionaries,
  upsertLocalDictionary,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import { chineseHash, dictionaryToStandardEntry, normalizeText } from "@/lib/standard";

function toResponse(entry: {
  id: string;
  chineseText: string;
  englishText: string;
  tags: string[];
  note: string | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    chineseText: entry.chineseText,
    englishText: entry.englishText,
    tags: entry.tags,
    note: entry.note,
    usageCount: entry.usageCount,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return fail("query parameter q is required", 400);

  const field = searchParams.get("field") ?? "auto";
  const limit = parseLimit(searchParams.get("limit"));
  const normalized = normalizeText(q);
  const where =
    field === "chinese"
      ? { normalizedChinese: { contains: normalized, mode: "insensitive" as const } }
      : field === "english"
        ? { normalizedEnglish: { contains: normalized, mode: "insensitive" as const } }
        : {
            OR: [
              { normalizedChinese: { contains: normalized, mode: "insensitive" as const } },
              { normalizedEnglish: { contains: normalized, mode: "insensitive" as const } },
            ],
          };

  try {
    const items = await prisma.dictionary.findMany({ where, take: limit, orderBy: { updatedAt: "desc" } });
    return ok({ items: items.map(toResponse) });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return ok({
        items: listLocalDictionaries({ query: q, field, limit }).map(toResponse),
        localFallback: true,
      });
    }
    return fail("dictionary search failed", 500, error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const chineseText = String(body.chineseText ?? "").trim();
  const englishText = String(body.englishText ?? "").trim();
  if (!chineseText || !englishText) return fail("chineseText and englishText are required", 400);

  const hash = chineseHash(chineseText);
  try {
    const existing = await prisma.dictionary.findUnique({ where: { chineseHash: hash } });
    if (existing && existing.englishText !== englishText && body.resolution !== "UPDATE_DICTIONARY") {
      return ok(
        {
          conflicts: [
            {
              type: ConflictType.EXACT_CHINESE_DIFF_ENGLISH,
              severity: ConflictSeverity.BLOCKING,
              candidateChineseText: chineseText,
              candidateEnglishText: englishText,
              existingChineseText: existing.chineseText,
              existingEnglishText: existing.englishText,
              reason: "Chinese baseline already exists with a different English value.",
            },
          ],
        },
        409,
      );
    }

    const dictionaryEntries = await prisma.dictionary.findMany({ take: 500 });
    const conflictSummary = detectConflicts(
      [
        {
          key: "incoming",
          keyPath: ["incoming"],
          sourceValue: chineseText,
          translatedValue: englishText,
          locale: "en-US",
          status: "NORMAL",
        },
      ],
      dictionaryEntries.map(dictionaryToStandardEntry),
    );

    if (conflictSummary.hasBlocking && body.resolution !== "UPDATE_DICTIONARY") {
      return ok({ conflictSummary }, 409);
    }

    const entry = await prisma.dictionary.upsert({
      where: { chineseHash: hash },
      update: {
        englishText,
        normalizedEnglish: normalizeText(englishText),
        tags: Array.isArray(body.tags) ? body.tags : [],
        note: body.note ?? null,
      },
      create: {
        chineseText,
        chineseHash: hash,
        normalizedChinese: normalizeText(chineseText),
        englishText,
        normalizedEnglish: normalizeText(englishText),
        tags: Array.isArray(body.tags) ? body.tags : [],
        note: body.note ?? null,
      },
    });

    await prisma.dictionaryRevision.create({
      data: {
        dictionaryId: entry.id,
        previousEnglish: existing?.englishText ?? null,
        nextEnglish: englishText,
        reason: body.reason ?? "manual dictionary write",
        changedById: body.changedById ?? null,
      },
    });

    return ok({ entry: toResponse(entry), conflictSummary }, existing ? 200 : 201);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("dictionary write failed", 500, error instanceof Error ? error.message : String(error));
    }

    const existing = findLocalDictionaryByChineseHash(hash);
    if (existing && existing.englishText !== englishText && body.resolution !== "UPDATE_DICTIONARY") {
      return ok(
        {
          conflicts: [
            {
              type: ConflictType.EXACT_CHINESE_DIFF_ENGLISH,
              severity: ConflictSeverity.BLOCKING,
              candidateChineseText: chineseText,
              candidateEnglishText: englishText,
              existingChineseText: existing.chineseText,
              existingEnglishText: existing.englishText,
              reason: "Chinese baseline already exists with a different English value.",
            },
          ],
          localFallback: true,
        },
        409,
      );
    }

    const conflictSummary = detectConflicts(
      [
        {
          key: "incoming",
          keyPath: ["incoming"],
          sourceValue: chineseText,
          translatedValue: englishText,
          locale: "en-US",
          status: "NORMAL",
        },
      ],
      getLocalDictionaryEntriesForConflict(),
    );

    if (conflictSummary.hasBlocking && body.resolution !== "UPDATE_DICTIONARY") {
      return ok({ conflictSummary, localFallback: true }, 409);
    }

    const { entry, existed } = upsertLocalDictionary({
      chineseText,
      englishText,
      tags: Array.isArray(body.tags) ? body.tags : [],
      note: body.note ?? null,
    });
    return ok({ entry: toResponse(entry), conflictSummary, localFallback: true }, existed ? 200 : 201);
  }
}
