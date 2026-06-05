import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { clearUserStateCache, requireAdmin } from "@/lib/auth";
import {
  createLocalUser,
  isDatabaseUnavailable,
  listLocalUsers,
} from "@/lib/local-store";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let body = "";
  for (let index = 0; index < 8; index++) {
    body += chars[Math.floor(Math.random() * chars.length)];
  }
  return `Bt@${body}9`;
}

function toUserResponse(user: {
  id: string;
  username: string;
  role: UserRole | "ADMIN" | "MAINTAINER";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim();
  const activeParam = searchParams.get("isActive");
  const isActive = activeParam === "true" ? true : activeParam === "false" ? false : undefined;
  try {
    const users = await prisma.user.findMany({
      where: {
        ...(username ? { username: { contains: username, mode: "insensitive" } } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return ok({ items: users.map(toUserResponse) });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("用户列表获取失败", 500, error instanceof Error ? error.message : String(error));
    }
    return ok({ items: listLocalUsers({ username, isActive }).map(toUserResponse), localFallback: true });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await request.json();
  const username = String(body.username ?? "").trim();
  if (!username) return fail("用户名不能为空", 400);
  const password = randomPassword();
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: { username, passwordHash, role: UserRole.MAINTAINER },
    });
    clearUserStateCache(user.id);
    return ok({ user: toUserResponse(user), password }, 201);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message.includes("Unique constraint") ? "用户名已存在" : "用户创建失败", message.includes("Unique constraint") ? 409 : 500, message);
    }
    try {
      const user = createLocalUser({ username, passwordHash, role: "MAINTAINER" });
      return ok({ user: toUserResponse(user), password, localFallback: true }, 201);
    } catch {
      return fail("用户名已存在", 409);
    }
  }
}
