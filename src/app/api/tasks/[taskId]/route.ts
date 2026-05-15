import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const task = await prisma.translationTask.findUnique({ where: { id: taskId } });
  if (!task) return fail("task not found", 404);
  const latestSnapshot = await prisma.taskSnapshot.findFirst({
    where: { taskId },
    orderBy: { version: "desc" },
  });
  return ok({ task, latestSnapshot });
}
