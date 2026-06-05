import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { clearDictionaryQueryCache } from "@/lib/dictionary-query-cache";
import {
  clearLocalDictionaries,
  clearLocalProjects,
  clearLocalSnapshots,
  isDatabaseUnavailable,
  resetLocalSnapshotsAndDictionaries,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

type MaintenanceAction = "clear-dictionaries" | "clear-snapshots" | "reset-system";

const actionLabels: Record<MaintenanceAction, string> = {
  "clear-dictionaries": "清空字典库",
  "clear-snapshots": "清空快照",
  "reset-system": "重置系统功能（快照、字典）",
};

function parseAction(value: unknown): MaintenanceAction | null {
  if (
    value === "clear-dictionaries" ||
    value === "clear-snapshots" ||
    value === "reset-system"
  ) {
    return value;
  }
  return null;
}

async function clearDatabaseDictionaries() {
  const [dictionaries, dictionaryRevisions, dictionaryConflictsUpdated] = await prisma.$transaction(async (tx) => {
    const dictionaryCount = await tx.dictionary.count();
    const revisionCount = await tx.dictionaryRevision.count();
    const conflictCount = await tx.dictionaryConflict.count({ where: { dictionaryId: { not: null } } });

    await tx.dictionaryConflict.updateMany({
      where: { dictionaryId: { not: null } },
      data: { dictionaryId: null },
    });
    await tx.dictionaryRevision.deleteMany();
    await tx.dictionary.deleteMany();

    return [dictionaryCount, revisionCount, conflictCount] as const;
  });
  clearDictionaryQueryCache();
  return { dictionaries, dictionaryRevisions, dictionaryConflictsUpdated };
}

async function clearDatabaseSnapshots() {
  const [snapshots, snapshotConflicts] = await prisma.$transaction(async (tx) => {
    const snapshotCount = await tx.taskSnapshot.count();
    const snapshotConflictCount = await tx.dictionaryConflict.count({ where: { snapshotId: { not: null } } });

    await tx.dictionaryConflict.deleteMany({ where: { snapshotId: { not: null } } });
    await tx.taskSnapshot.deleteMany();

    return [snapshotCount, snapshotConflictCount] as const;
  });
  return { snapshots, snapshotConflicts };
}

async function resetDatabaseSnapshotsAndDictionaries(clearProjects: boolean) {
  const [
    snapshots,
    snapshotConflicts,
    dictionaries,
    dictionaryRevisions,
    dictionaryConflictsUpdated,
    projects,
    tasks,
    draftRows,
    projectConflicts,
  ] =
    await prisma.$transaction(async (tx) => {
      const snapshotCount = await tx.taskSnapshot.count();
      const snapshotConflictCount = await tx.dictionaryConflict.count({ where: { snapshotId: { not: null } } });
      const dictionaryCount = await tx.dictionary.count();
      const dictionaryRevisionCount = await tx.dictionaryRevision.count();
      const dictionaryConflictCount = await tx.dictionaryConflict.count({
        where: { dictionaryId: { not: null }, snapshotId: null },
      });
      const projectCount = clearProjects ? await tx.productProject.count() : 0;
      const taskCount = clearProjects ? await tx.translationTask.count() : 0;
      const draftRowCount = clearProjects ? await tx.taskDraftRow.count() : 0;
      const projectConflictCount = clearProjects
        ? await tx.dictionaryConflict.count({
            where: { taskId: { not: null }, snapshotId: null },
          })
        : 0;

      await tx.dictionaryConflict.deleteMany({ where: { snapshotId: { not: null } } });
      await tx.taskSnapshot.deleteMany();
      await tx.dictionaryConflict.updateMany({
        where: { dictionaryId: { not: null } },
        data: { dictionaryId: null },
      });
      await tx.dictionaryRevision.deleteMany();
      await tx.dictionary.deleteMany();
      if (clearProjects) {
        await tx.dictionaryConflict.deleteMany({ where: { taskId: { not: null } } });
        await tx.taskDraftRow.deleteMany();
        await tx.translationTask.deleteMany();
        await tx.productProject.deleteMany();
      }

      return [
        snapshotCount,
        snapshotConflictCount,
        dictionaryCount,
        dictionaryRevisionCount,
        dictionaryConflictCount,
        projectCount,
        taskCount,
        draftRowCount,
        projectConflictCount,
      ] as const;
    });

  clearDictionaryQueryCache();
  return {
    snapshots,
    snapshotConflicts,
    dictionaries,
    dictionaryRevisions,
    dictionaryConflictsUpdated,
    projects,
    tasks,
    draftRows,
    projectConflicts,
  };
}

function runLocalAction(action: MaintenanceAction, clearProjects: boolean) {
  if (action === "clear-dictionaries") {
    const counts = clearLocalDictionaries();
    clearDictionaryQueryCache();
    return counts;
  }
  if (action === "clear-snapshots") return clearLocalSnapshots();
  const counts = resetLocalSnapshotsAndDictionaries();
  clearDictionaryQueryCache();
  if (!clearProjects) return counts;
  return {
    ...counts,
    ...clearLocalProjects(),
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as { action?: unknown; clearProjects?: unknown } | null;
  const action = parseAction(body?.action);
  const clearProjects = body?.clearProjects === true;
  if (!action) {
    return fail("invalid maintenance action", 400, {
      allowed: Object.keys(actionLabels),
    });
  }

  try {
    const counts =
      action === "clear-dictionaries"
        ? await clearDatabaseDictionaries()
        : action === "clear-snapshots"
          ? await clearDatabaseSnapshots()
          : await resetDatabaseSnapshotsAndDictionaries(clearProjects);

    return ok({
      action,
      label: actionLabels[action],
      storage: "database",
      counts,
      clearProjects: action === "reset-system" ? clearProjects : false,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return ok({
        action,
        label: actionLabels[action],
        storage: "memory",
        counts: runLocalAction(action, action === "reset-system" && clearProjects),
        localFallback: true,
        clearProjects: action === "reset-system" ? clearProjects : false,
      });
    }

    return fail(
      `${actionLabels[action]}失败`,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
