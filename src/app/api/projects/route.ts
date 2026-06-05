import { NextRequest } from "next/server";
import { fail, ok, parseLimit } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createLocalProject, findLocalProjectByName, isDatabaseUnavailable, listLocalProjects } from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

function generateProjectCode() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BT-${stamp}-${suffix}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
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
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return fail("name is required", 400);

  try {
    const existing = await prisma.productProject.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) return ok({ project: existing, existed: true });

    const project = await prisma.productProject.create({
      data: {
        code: generateProjectCode(),
        name,
        description: body.description ?? null,
        createdById: currentUser.id,
      },
    });
    return ok({ project }, 201);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const existing = findLocalProjectByName(name);
      if (existing) return ok({ project: existing, existed: true, localFallback: true });
      const project = createLocalProject({
        code: generateProjectCode(),
        name,
        description: body.description ?? null,
        createdById: currentUser.id,
      });
      return ok({ project, localFallback: true }, 201);
    }
    return fail("project create failed", 500, error instanceof Error ? error.message : String(error));
  }
}
