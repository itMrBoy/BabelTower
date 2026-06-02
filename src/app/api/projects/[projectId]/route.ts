import { fail, ok } from "@/lib/api";
import { deleteLocalProject, isDatabaseUnavailable, updateLocalProject } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return fail("name is required", 400);

  try {
    const duplicate = await prisma.productProject.findFirst({
      where: {
        id: { not: projectId },
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (duplicate) return fail("project name already exists", 409);

    const project = await prisma.productProject.update({
      where: { id: projectId },
      data: {
        name,
        description: body.description ?? undefined,
      },
    });
    return ok({ project });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const project = updateLocalProject(projectId, {
        name,
        description: body.description ?? undefined,
      });
      if (!project) return fail("project not found", 404);
      return ok({ project, localFallback: true });
    }
    const message = error instanceof Error ? error.message : String(error);
    return fail(message.includes("Record to update not found") ? "project not found" : "project update failed", message.includes("Record to update not found") ? 404 : 500, message);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;

  try {
    await prisma.productProject.delete({ where: { id: projectId } });
    return ok({ deleted: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const project = deleteLocalProject(projectId);
      if (!project) return fail("project not found", 404);
      return ok({ deleted: true, project, localFallback: true });
    }
    const message = error instanceof Error ? error.message : String(error);
    return fail(message.includes("Record to delete does not exist") ? "project not found" : "project delete failed", message.includes("Record to delete does not exist") ? 404 : 500, message);
  }
}
