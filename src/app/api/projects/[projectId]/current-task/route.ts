import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getLocalCurrentTask, isDatabaseUnavailable } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireUser(_request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const { projectId } = await context.params;
  try {
    const project = await prisma.productProject.findUnique({ where: { id: projectId } });
    const task = project?.currentTaskId
      ? await prisma.translationTask.findFirst({
          where: {
            id: project.currentTaskId,
            OR: [
              { status: { not: "DRAFT" } },
              { createdById: currentUser.id },
            ],
          },
        })
      : await prisma.translationTask.findFirst({
          where: { projectId, status: "DRAFT", isEditable: true, createdById: currentUser.id },
          orderBy: { updatedAt: "desc" },
        });
    return ok({ task });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const task = getLocalCurrentTask(projectId);
      if (task && (task.status !== "DRAFT" || task.createdById === currentUser.id)) {
        return ok({ task, localFallback: true });
      }
      return ok({ task: null, localFallback: true });
    }
    return fail("current task failed", 500, error instanceof Error ? error.message : String(error));
  }
}
