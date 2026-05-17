import { fail, ok } from "@/lib/api";
import { isDatabaseUnavailable, listLocalSnapshots } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  try {
    const items = await prisma.taskSnapshot.findMany({ where: { taskId }, orderBy: { version: "desc" } });
    return ok({ items });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return ok({ items: listLocalSnapshots(taskId), localFallback: true });
    return fail("task history failed", 500, error instanceof Error ? error.message : String(error));
  }
}
