import { NextRequest } from "next/server";
import { fail, ok, parseLimit } from "@/lib/api";
import { createLocalProject, isDatabaseUnavailable, listLocalProjects } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const limit = parseLimit(searchParams.get("limit"));
  try {
    const items = await prisma.productProject.findMany({
      where: q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
    return ok({ items });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return ok({ items: listLocalProjects(q, limit), localFallback: true });
    return fail("project list failed", 500, error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!code || !name) return fail("code and name are required", 400);

  try {
    const project = await prisma.productProject.create({
      data: {
        code,
        name,
        description: body.description ?? null,
        createdById: body.createdById ?? null,
      },
    });
    return ok({ project }, 201);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const project = createLocalProject({
        code,
        name,
        description: body.description ?? null,
        createdById: body.createdById ?? null,
      });
      return ok({ project, localFallback: true }, 201);
    }
    return fail("project create failed", 500, error instanceof Error ? error.message : String(error));
  }
}
