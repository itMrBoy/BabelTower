import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { fail } from "@/lib/api";
import { bumpTokenVersion, findLoginUser, setSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) return fail("用户名和密码不能为空", 400);

  const user = await findLoginUser(username);
  if (!user) return fail("用户名或密码错误", 401);
  if (!user.isActive) return fail("账号已禁用，请联系管理员", 403);
  if (!(await verifyPassword(password, user.passwordHash))) return fail("用户名或密码错误", 401);

  // 单会话互踢：登录即递增 tokenVersion，同账号此前的登录态全部失效（后登顶前登）。
  const tokenVersion = (await bumpTokenVersion(user.id)) ?? user.tokenVersion;

  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role as UserRole,
    },
  });
  setSessionCookie(response, {
    id: user.id,
    username: user.username,
    role: user.role as UserRole,
    tokenVersion,
  });
  return response;
}
