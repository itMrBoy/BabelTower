import { fail, ok } from "@/lib/api";
import { getLocalCurrentTask, isDatabaseUnavailable } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  try {
    const project = await prisma.productProject.findUnique({ where: { id: projectId } });
    const task = project?.currentTaskId
      ? await prisma.translationTask.findUnique({ where: { id: project.currentTaskId } })
      : await prisma.translationTask.findFirst({
          where: { projectId, status: "DRAFT", isEditable: true },
          orderBy: { updatedAt: "desc" },
        });
    return ok({ task });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return ok({ task: getLocalCurrentTask(projectId), localFallback: true });
    }
    return fail("current task failed", 500, error instanceof Error ? error.message : String(error));
  }
}
