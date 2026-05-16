import { NextResponse } from "next/server";

export function requestId() {
  return crypto.randomUUID();
}

export function ok<T extends Record<string, unknown>>(body: T, status = 200) {
  return NextResponse.json({ ...body, requestId: requestId() }, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { error: { message, details }, requestId: requestId() },
    { status },
  );
}

export function parseLimit(value: string | null, fallback = 20, max = 100) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}
