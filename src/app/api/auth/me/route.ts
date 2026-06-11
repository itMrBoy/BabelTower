import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const user = auth.user;
  return ok({ user: { id: user.id, username: user.username, role: user.role } });
}
