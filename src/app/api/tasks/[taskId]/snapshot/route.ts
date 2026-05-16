import { NextRequest } from "next/server";
import { SnapshotKind } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const body = await request.json();
  const baseVersion = Number(body.baseVersion);
  const previewRows = body.previewRows;
  if (!baseVersion || !Array.isArray(previewRows)) return fail("baseVersion and previewRows are required", 400);

  const task = await prisma.translationTask.findUnique({ where: { id: taskId } });
  if (!task) return fail("task not found", 404);
  if (task.latestVersion !== baseVersion) {
    return fail("snapshot version conflict", 409, { expected: task.latestVersion, actual: baseVersion });
  }

  const latest = await prisma.taskSnapshot.findFirst({ where: { taskId }, orderBy: { version: "desc" } });
  const nextVersion = baseVersion + 1;
  const snapshot = await prisma.$transaction(async (tx) => {
    await tx.translationTask.update({ where: { id: taskId }, data: { latestVersion: nextVersion } });
    return tx.taskSnapshot.create({
      data: {
        taskId,
        version: nextVersion,
        kind: SnapshotKind.MANUAL_DRAFT,
        standardDocuments: latest?.standardDocuments ?? {},
        previewRows,
        conflictSummary: latest?.conflictSummary ?? {},
      },
    });
  });

  return ok({ snapshot });
}
