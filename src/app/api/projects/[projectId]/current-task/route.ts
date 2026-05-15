import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const project = await prisma.productProject.findUnique({ where: { id: projectId } });
  const task = project?.currentTaskId
    ? await prisma.translationTask.findUnique({ where: { id: project.currentTaskId } })
    : await prisma.translationTask.findFirst({
        where: { projectId, status: "DRAFT", isEditable: true },
        orderBy: { updatedAt: "desc" },
      });
  return ok({ task });
}
