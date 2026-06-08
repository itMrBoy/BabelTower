import { NextRequest } from "next/server";
import { ConflictSeverity, ConflictType, FileFormat, Prisma, SnapshotKind, TaskMode, TaskStatus } from "@prisma/client";
import { detectConflicts } from "@/domain/conflict/conflict-detector";
import type { StandardI18nDocument } from "@/domain/standard-i18n/types";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  createLocalImportTask,
  getLocalDictionaryEntriesForConflict,
  getLocalUserById,
  isDatabaseUnavailable,
  listLocalTasks,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";
import {
  annotateConflictLevels,
  buildPreviewRows,
  dictionaryToStandardEntry,
  mergeTargetDocument,
  parseI18nDocument,
  previewRowToDraftData,
  summarizeConflicts,
} from "@/lib/standard";

function toPrismaFormat(format: string | null, fileName: string): FileFormat {
  const value = (format ?? (fileName.endsWith(".properties") ? "PROPERTIES" : fileName.endsWith(".ts") ? "TS" : "JSON")).toUpperCase();
  if (value === "TS") return "TS" as FileFormat;
  return value === "PROPERTIES" ? FileFormat.PROPERTIES : FileFormat.JSON;
}

function toParserFormat(format: FileFormat) {
  if (String(format) === "TS") return "ts";
  return format === FileFormat.PROPERTIES ? "properties" : "json";
}

function toMode(mode: string | null): TaskMode {
  return mode === "DUAL_SOURCE" ? TaskMode.DUAL_SOURCE : TaskMode.SINGLE_SOURCE;
}

function parseFailureDetails(fileName: string, error: unknown) {
  return {
    type: "format_parse_error",
    fileName,
    message: error instanceof Error ? error.message : String(error),
  };
}

function localCreator(createdById: string | null) {
  const user = createdById ? getLocalUserById(createdById) : null;
  return user ? { id: user.id, username: user.username } : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const historyOnly = searchParams.get("historyOnly") === "true";
  try {
    const items = await prisma.translationTask.findMany({
      where: {
        projectId,
        status: status ? (status as TaskStatus) : historyOnly ? TaskStatus.READ_ONLY_HISTORY : undefined,
        OR: [
          { status: { not: TaskStatus.DRAFT } },
          { createdById: currentUser.id },
        ],
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    const creatorIds = Array.from(new Set(items.map((item) => item.createdById).filter(Boolean))) as string[];
    const creators = creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, username: true },
        })
      : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
    return ok({
      items: items.map((item) => ({
        ...item,
        createdBy: item.createdById ? creatorById.get(item.createdById) ?? null : null,
      })),
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const items = listLocalTasks({ projectId, status, historyOnly }).filter(
        (task) => task.status !== "DRAFT" || task.createdById === currentUser.id,
      );
      return ok({
        items: items.map((item) => ({ ...item, createdBy: localCreator(item.createdById) })),
        localFallback: true,
      });
    }
    return fail("task list failed", 500, error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const form = await request.formData();
  const sourceFile = form.get("sourceFile") as File | null;
  const targetFile = form.get("targetFile") as File | null;
  const projectId = String(form.get("projectId") ?? "").trim();
  const name = String(form.get("name") ?? sourceFile?.name ?? "").trim();

  if (!sourceFile) return fail("sourceFile is required", 400);
  if (!projectId || !name) return fail("projectId and name are required", 400);

  const format = toPrismaFormat(String(form.get("format") ?? ""), sourceFile.name);
  const mode = toMode(String(form.get("mode") ?? "SINGLE_SOURCE"));
  if (mode === TaskMode.DUAL_SOURCE && !targetFile) {
    return fail("targetFile is required when mode is DUAL_SOURCE", 400);
  }

  const sourceContent = await sourceFile.text();
  let sourceDocument: StandardI18nDocument;
  try {
    sourceDocument = parseI18nDocument({
      content: sourceContent,
      fileName: sourceFile.name,
      format: toParserFormat(format),
      locale: String(form.get("sourceLocale") ?? "zh-CN"),
    });
  } catch (error) {
    return fail("format_parse_error", 400, parseFailureDetails(sourceFile.name, error));
  }

  let targetDocument: StandardI18nDocument | undefined;
  if (targetFile) {
    try {
      targetDocument = parseI18nDocument({
        content: await targetFile.text(),
        fileName: targetFile.name,
        format: toParserFormat(format),
        locale: String(form.get("targetLocale") ?? "en-US"),
      });
    } catch (error) {
      return fail("format_parse_error", 400, parseFailureDetails(targetFile.name, error));
    }
  }

  const document = mergeTargetDocument(sourceDocument, targetDocument);
  if (document.entries.length === 0) {
    return fail("format_parse_error", 400, {
      type: "format_parse_error",
      fileName: sourceFile.name,
      message: "No translatable entries found. Check the file format and key=value pairs.",
    });
  }

  const previewRowsRaw = buildPreviewRows(document);

  try {
    const dictionary = await prisma.dictionary.findMany({
      take: 5000,
      select: {
        id: true,
        chineseText: true,
        englishText: true,
      },
    });
    const conflictSummary = detectConflicts(document.entries, dictionary.map(dictionaryToStandardEntry));
    const summary = summarizeConflicts(conflictSummary);
    const previewRows = annotateConflictLevels(previewRowsRaw, conflictSummary);
    const dictionaryHits: Record<string, string> = {};
    for (const entry of dictionary) {
      if (entry.chineseText && entry.englishText) {
        dictionaryHits[entry.chineseText] = entry.englishText;
      }
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.translationTask.create({
        data: {
          projectId,
          name,
          mode,
          format,
          sourceLocale: String(form.get("sourceLocale") ?? "zh-CN"),
          targetLocale: String(form.get("targetLocale") ?? "en-US"),
          sourceFilename: sourceFile.name,
          targetFilename: targetFile?.name ?? null,
          status: TaskStatus.DRAFT,
          latestVersion: 1,
          createdById: currentUser.id,
        },
      });

      const snapshot = await tx.taskSnapshot.create({
        data: {
          taskId: created.id,
          version: 1,
          kind: SnapshotKind.IMPORTED,
          standardDocuments: { source: document, target: targetDocument ?? null } as unknown as Prisma.InputJsonValue,
          previewRows: previewRows as unknown as Prisma.InputJsonValue,
          conflictSummary: summary as unknown as Prisma.InputJsonValue,
          createdById: currentUser.id,
        },
      });

      await tx.taskDraftRow.createMany({
        data: previewRows.map((row, rowIndex) => ({
          taskId: created.id,
          ...previewRowToDraftData(row, rowIndex),
          keyPath: row.keyPath as unknown as Prisma.InputJsonValue,
        })),
      });

      const allConflicts = [
        ...conflictSummary.blocking.map((item) => ({ item, severity: ConflictSeverity.BLOCKING, type: ConflictType.EXACT_CHINESE_DIFF_ENGLISH })),
        ...conflictSummary.warning.map((item) => ({ item, severity: ConflictSeverity.WARNING, type: ConflictType.SIMILAR_CHINESE })),
        ...conflictSummary.info.map((item) => ({ item, severity: ConflictSeverity.INFO, type: ConflictType.DUPLICATE_IDENTICAL })),
      ];

      if (allConflicts.length > 0) {
        await tx.dictionaryConflict.createMany({
          data: allConflicts.map(({ item, severity, type }) => ({
            taskId: created.id,
            snapshotId: snapshot.id,
            type,
            severity,
            candidateKey: item.key,
            candidateChineseText: item.chineseValue,
            candidateEnglishText: item.newEnglish,
            existingChineseText: item.chineseValue,
            existingEnglishText: item.existingEnglish,
            similarity: item.similarity ?? null,
            reason: severity === ConflictSeverity.BLOCKING
              ? "Chinese baseline matches but English differs."
              : severity === ConflictSeverity.WARNING
                ? "Chinese baseline is over similarity threshold."
                : "Chinese and English are already identical.",
          })),
        });
      }

      await tx.productProject.update({ where: { id: projectId }, data: { currentTaskId: created.id } });
      return { ...created, latestSnapshot: snapshot };
    },
    // 大文件导入需写入快照(含完整文档)、~1000 条 taskDraftRow 与 dictionaryConflict;
    // 默认 5s 事务超时不够,放长到 30s 作为安全网。
    { maxWait: 5_000, timeout: 30_000 });

    return ok({ task, latestSnapshot: task.latestSnapshot, previewRows, conflictSummary: summary, dictionaryHits }, 201);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("task import failed", 500, error instanceof Error ? error.message : String(error));
    }

    try {
      const localDictEntries = getLocalDictionaryEntriesForConflict();
      const conflictSummary = detectConflicts(document.entries, localDictEntries);
      const summary = summarizeConflicts(conflictSummary);
      const previewRows = annotateConflictLevels(previewRowsRaw, conflictSummary);
      const dictionaryHits: Record<string, string> = {};
      for (const entry of localDictEntries) {
        if (entry.sourceValue && entry.translatedValue) {
          dictionaryHits[entry.sourceValue] = entry.translatedValue;
        }
      }
      const { task, latestSnapshot } = createLocalImportTask({
        projectId,
        name,
        mode: mode as "SINGLE_SOURCE" | "DUAL_SOURCE",
        format: format as "JSON" | "PROPERTIES" | "TS",
        sourceLocale: String(form.get("sourceLocale") ?? "zh-CN"),
        targetLocale: String(form.get("targetLocale") ?? "en-US"),
        sourceFilename: sourceFile.name,
        targetFilename: targetFile?.name ?? null,
        document,
        targetDocument,
        previewRows,
        conflictSummary,
        summary,
        createdById: currentUser.id,
      });
      return ok({ task, latestSnapshot, previewRows, conflictSummary: summary, dictionaryHits, localFallback: true }, 201);
    } catch (localError) {
      return fail("task import failed", 500, localError instanceof Error ? localError.message : String(localError));
    }
  }
}
