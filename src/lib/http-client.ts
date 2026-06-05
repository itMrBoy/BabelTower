"use client";

export type ApiUser = {
  id: string;
  username: string;
  role: "ADMIN" | "MAINTAINER";
};

export function getErrorMessage(body: unknown, fallbackStatus?: number) {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallbackStatus ? `请求失败 (HTTP ${fallbackStatus})` : "请求失败";
}

export async function readBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/login") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new Event("babeltower:auth-expired"));
    redirectToLogin();
  }
  return response;
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await apiFetch(input, init);
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(getErrorMessage(body, response.status));
  }
  return body as T;
}
