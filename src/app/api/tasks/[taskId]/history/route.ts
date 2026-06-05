import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isDatabaseUnavailable, listLocalSnapshots } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return undefined;
  return Math.min(Math.max(parsed, 1), 100);
}

export async function GET(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const { taskId } = await context.params;
  const { searchParams } = new URL(request.url);
  const includeRows = searchParams.get("includeRows") === "true";
  const latestOnly = searchParams.get("latestOnly") === "true";
  const limit = parseLimit(searchParams.get("limit"));
  const take = latestOnly ? 1 : limit;

  try {
    const items = await prisma.taskSnapshot.findMany({
      where: {
        taskId,
        task: {
          OR: [
            { status: { not: "DRAFT" } },
            { createdById: currentUser.id },
          ],
        },
      },
      orderBy: { version: "desc" },
      take,
      select: {
        id: true,
        taskId: true,
        version: true,
        kind: true,
        conflictSummary: true,
        validationErrors: true,
        exportManifest: true,
        createdById: true,
        createdAt: true,
        ...(includeRows
          ? {
              standardDocuments: true,
              previewRows: true,
            }
          : {}),
      },
    });
    return ok({ items });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const snapshots = listLocalSnapshots(taskId)
        .filter((snapshot) => snapshot.createdById === null || snapshot.createdById === currentUser.id)
        .slice(0, take ?? undefined);
      const items = includeRows
        ? snapshots
        : snapshots.map(({ standardDocuments: _standardDocuments, previewRows: _previewRows, ...snapshot }) => snapshot);
      return ok({ items, localFallback: true });
    }
    return fail("task history failed", 500, error instanceof Error ? error.message : String(error));
  }
}
