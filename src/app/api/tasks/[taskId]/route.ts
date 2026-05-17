import { fail, ok } from "@/lib/api";
import { getLatestLocalSnapshot, getLocalTask, isDatabaseUnavailable } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  try {
    const task = await prisma.translationTask.findUnique({ where: { id: taskId } });
    if (!task) return fail("task not found", 404);
    const latestSnapshot = await prisma.taskSnapshot.findFirst({
      where: { taskId },
      orderBy: { version: "desc" },
    });
    return ok({ task, latestSnapshot });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const task = getLocalTask(taskId);
      if (!task) return fail("task not found", 404);
      return ok({ task, latestSnapshot: getLatestLocalSnapshot(taskId), localFallback: true });
    }
    return fail("task detail failed", 500, error instanceof Error ? error.message : String(error));
  }
}
