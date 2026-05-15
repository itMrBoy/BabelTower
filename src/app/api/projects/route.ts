import { NextRequest } from "next/server";
import { fail, ok, parseLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const limit = parseLimit(searchParams.get("limit"));
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
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!code || !name) return fail("code and name are required", 400);

  const project = await prisma.productProject.create({
    data: {
      code,
      name,
      description: body.description ?? null,
      createdById: body.createdById ?? null,
    },
  });
  return ok({ project }, 201);
}
