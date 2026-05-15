import { NextRequest } from "next/server";
import { ConflictSeverity, ConflictType, FileFormat, Prisma, SnapshotKind, TaskMode, TaskStatus } from "@prisma/client";
import { detectConflicts } from "@/domain/conflict/conflict-detector";
import { fail, ok } from "@/lib/api";
import { prisma, TransactionClient } from "@/lib/prisma";
import {
  buildPreviewRows,
  dictionaryToStandardEntry,
  mergeTargetDocument,
  parseI18nDocument,
  summarizeConflicts,
} from "@/lib/standard";

function toPrismaFormat(format: string | null, fileName: string): FileFormat {
  const value = (format ?? (fileName.endsWith(".properties") ? "PROPERTIES" : "JSON")).toUpperCase();
  return value === "PROPERTIES" ? FileFormat.PROPERTIES : FileFormat.JSON;
}

function toParserFormat(format: FileFormat) {
  return format === FileFormat.PROPERTIES ? "properties" : "json";
}

function toMode(mode: string | null): TaskMode {
  return mode === "DUAL_SOURCE" ? TaskMode.DUAL_SOURCE : TaskMode.SINGLE_SOURCE;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const historyOnly = searchParams.get("historyOnly") === "true";
  const items = await prisma.translationTask.findMany({
    where: {
      projectId,
      status: status ? (status as TaskStatus) : historyOnly ? TaskStatus.READ_ONLY_HISTORY : undefined,
    },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ items });
}

export async function POST(request: NextRequest) {
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
  const sourceDocument = parseI18nDocument({
    content: sourceContent,
    fileName: sourceFile.name,
    format: toParserFormat(format),
    locale: String(form.get("sourceLocale") ?? "zh-CN"),
  });

  const targetDocument = targetFile
    ? parseI18nDocument({
        content: await targetFile.text(),
        fileName: targetFile.name,
        format: toParserFormat(format),
        locale: String(form.get("targetLocale") ?? "en-US"),
      })
    : undefined;

  if (mode === TaskMode.DUAL_SOURCE && targetDocument) {
    const sourceKeys = new Set(sourceDocument.entries.map((e) => e.key));
    const targetKeys = new Set(targetDocument.entries.map((e) => e.key));
    const missingInTarget = [...sourceKeys].filter((k) => !targetKeys.has(k));
    const missingInSource = [...targetKeys].filter((k) => !sourceKeys.has(k));
    if (missingInTarget.length > 0 || missingInSource.length > 0) {
      const fmt = (arr: string[]) => arr.slice(0, 3).join(", ") + (arr.length > 3 ? "..." : "");
      return fail(
        `Key mismatch: ${missingInSource.length} keys only in source (${fmt(missingInSource)}); ${missingInTarget.length} keys only in target (${fmt(missingInTarget)})`,
        400,
      );
    }
  }

  const document = mergeTargetDocument(sourceDocument, targetDocument);
  const previewRows = buildPreviewRows(document);
  const dictionary = await prisma.dictionary.findMany({ take: 5000 });
  const conflictSummary = detectConflicts(document.entries, dictionary.map(dictionaryToStandardEntry));
  const summary = summarizeConflicts(conflictSummary);

  const task = await prisma.$transaction(async (tx: TransactionClient) => {
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
      },
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
  });

  return ok({ task, snapshot: task.latestSnapshot }, 201);
}
