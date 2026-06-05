import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { getCurrentUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return fail("请先登录", 401);
  return ok({ user: { id: user.id, username: user.username, role: user.role } });
}
