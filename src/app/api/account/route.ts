import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { clearSessionCookie, clearUserStateCache, requireUser } from "@/lib/auth";
import {
  getLocalUserById,
  isDatabaseUnavailable,
  updateLocalAccount,
} from "@/lib/local-store";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const currentUser = auth.user;
  const body = await request.json();
  const username = typeof body.username === "string" ? body.username.trim() : undefined;
  const currentPassword = String(body.currentPassword ?? "");
  const nextPassword = typeof body.password === "string" ? body.password : undefined;

  if (username !== undefined && username.length === 0) return fail("用户名不能为空", 400);
  if (nextPassword !== undefined) {
    const passwordError = validatePasswordStrength(nextPassword);
    if (passwordError) return fail(passwordError, 400);
    if (!currentPassword) return fail("修改密码需要输入当前密码", 400);
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
    if (!user) return fail("用户不存在", 404);
    if (nextPassword && !(await verifyPassword(currentPassword, user.passwordHash))) {
      return fail("当前密码错误", 400);
    }
    const nextPasswordHash = nextPassword ? await hashPassword(nextPassword) : null;
    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        ...(username ? { username } : {}),
        ...(nextPasswordHash
          ? { passwordHash: nextPasswordHash, tokenVersion: { increment: 1 } }
          : {}),
      },
      select: { id: true, username: true, role: true },
    });
    clearUserStateCache(currentUser.id);
    const response = ok({ user: updated });
    if (nextPassword) clearSessionCookie(response);
    return response;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message.includes("Unique constraint") ? "用户名已存在" : "账号更新失败", message.includes("Unique constraint") ? 409 : 500, message);
    }
    const localUser = getLocalUserById(currentUser.id);
    if (!localUser) return fail("用户不存在", 404);
    if (nextPassword && !(await verifyPassword(currentPassword, localUser.passwordHash))) {
      return fail("当前密码错误", 400);
    }
    const updated = updateLocalAccount(currentUser.id, {
      ...(username ? { username } : {}),
      ...(nextPassword ? { passwordHash: await hashPassword(nextPassword) } : {}),
    });
    if (!updated) return fail("用户不存在", 404);
    clearUserStateCache(currentUser.id);
    const response = ok({
      user: { id: updated.id, username: updated.username, role: updated.role },
      localFallback: true,
    });
    if (nextPassword) clearSessionCookie(response);
    return response;
  }
}
