import { NextResponse } from "next/server";
import { clearLocalStore } from "@/lib/local-store";

export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  clearLocalStore();
  return NextResponse.json({ ok: true, cleared: true });
}
