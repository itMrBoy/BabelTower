import { NextResponse } from "next/server";
import { clearLocalStore } from "@/lib/local-store";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  clearLocalStore();
  return NextResponse.json({ ok: true, cleared: true });
}
