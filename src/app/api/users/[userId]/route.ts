import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { clearUserStateCache, requireAdmin } from "@/lib/auth";
import {
  countLocalActiveAdmins,
  deleteLocalUser,
  getLocalUserById,
  isDatabaseUnavailable,
  localUserBusinessUsage,
  setLocalUserActive,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

function toUserResponse(user: {
  id: string;
  username: string;
  role: "ADMIN" | "MAINTAINER";
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { userId } = await context.params;
  const body = await request.json();
  const isActive = Boolean(body.isActive);
  if (userId === auth.user.id && !isActive) return fail("不能禁用当前登录用户", 400);

  try {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return fail("用户不存在", 404);
    if (target.role === "ADMIN" && target.isActive && !isActive) {
      const otherAdmins = await prisma.user.count({
        where: { id: { not: userId }, role: "ADMIN", isActive: true },
      });
      if (otherAdmins === 0) return fail("系统至少需要保留一个可用管理员", 400);
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive, tokenVersion: { increment: 1 } },
    });
    clearUserStateCache(userId);
    return ok({ user: toUserResponse(updated) });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      return fail("用户状态更新失败", 500, error instanceof Error ? error.message : String(error));
    }
    const target = getLocalUserById(userId);
    if (!target) return fail("用户不存在", 404);
    if (target.role === "ADMIN" && target.isActive && !isActive && countLocalActiveAdmins(userId) === 0) {
      return fail("系统至少需要保留一个可用管理员", 400);
    }
    const updated = setLocalUserActive(userId, isActive);
    if (!updated) return fail("用户不存在", 404);
    clearUserStateCache(userId);
    return ok({ user: toUserResponse(updated), localFallback: true });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { userId } = await context.params;
  if (userId === auth.user.id) return fail("不能删除当前登录用户", 400);

  try {
    const usage = {
      projects: await prisma.productProject.count({ where: { createdById: userId } }),
      tasks: await prisma.translationTask.count({ where: { createdById: userId } }),
      snapshots: await prisma.taskSnapshot.count({ where: { createdById: userId } }),
      dictionaries: await prisma.dictionary.count({
        where: { OR: [{ createdById: userId }, { updatedById: userId }] },
      }),
      revisions: await prisma.dictionaryRevision.count({ where: { changedById: userId } }),
      conflicts: await prisma.dictionaryConflict.count({ where: { resolvedById: userId } }),
    };
    if (Object.values(usage).some((value) => value > 0)) {
      return fail("该用户已有业务数据，不能删除；请使用禁用功能保留审计信息", 409, usage);
    }
    const deleted = await prisma.user.delete({ where: { id: userId } });
    clearUserStateCache(userId);
    return ok({ deleted: true, user: toUserResponse(deleted) });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message.includes("Record to delete does not exist") ? "用户不存在" : "用户删除失败", message.includes("Record to delete does not exist") ? 404 : 500, message);
    }
    try {
      const deleted = deleteLocalUser(userId);
      if (!deleted) return fail("用户不存在", 404);
      clearUserStateCache(userId);
      return ok({ deleted: true, user: toUserResponse(deleted), localFallback: true });
    } catch {
      return fail("该用户已有业务数据，不能删除；请使用禁用功能保留审计信息", 409, localUserBusinessUsage(userId));
    }
  }
}
