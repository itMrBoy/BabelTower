import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const items = await prisma.taskSnapshot.findMany({ where: { taskId }, orderBy: { version: "desc" } });
  return ok({ items });
}
