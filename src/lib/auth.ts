import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { fail } from "@/lib/api";
import {
  clearLocalUserCache,
  getLocalUserById,
  getLocalUserByUsername,
  isDatabaseUnavailable,
  seedLocalAdmin,
} from "@/lib/local-store";
import { prisma } from "@/lib/prisma";

export const AUTH_COOKIE = "babeltower_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type CurrentUser = {
  id: string;
  username: string;
  role: UserRole | "ADMIN" | "MAINTAINER";
  tokenVersion: number;
};

type TokenPayload = CurrentUser & {
  exp: number;
};

type CachedUserState = CurrentUser & {
  isActive: boolean;
  cachedAt: number;
};

const globalForAuth = globalThis as typeof globalThis & {
  __babelTowerAuthSecret?: string;
  __babelTowerUserStateCache?: Map<string, CachedUserState>;
};

function secret() {
  if (!globalForAuth.__babelTowerAuthSecret) {
    globalForAuth.__babelTowerAuthSecret =
      process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || randomBytes(32).toString("hex");
  }
  return globalForAuth.__babelTowerAuthSecret;
}

function userCache() {
  if (!globalForAuth.__babelTowerUserStateCache) {
    globalForAuth.__babelTowerUserStateCache = new Map();
  }
  return globalForAuth.__babelTowerUserStateCache;
}

function base64url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function unbase64url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(user: CurrentUser) {
  const payload: TokenPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

function parseSessionToken(token: string): TokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = signPayload(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(unbase64url(encoded)) as TokenPayload;
    if (!payload.id || !payload.username || !payload.role || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function setSessionCookie(response: NextResponse, user: CurrentUser) {
  response.cookies.set(AUTH_COOKIE, createSessionToken(user), sessionCookieOptions());
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

export function clearUserStateCache(userId: string) {
  userCache().delete(userId);
  clearLocalUserCache(userId);
}

function cookieFromHeader(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

async function readUserState(userId: string) {
  const cached = userCache().get(userId);
  if (cached) return cached;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, isActive: true, tokenVersion: true },
    });
    if (!user) return null;
    const state: CachedUserState = { ...user, cachedAt: Date.now() };
    userCache().set(user.id, state);
    return state;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    seedLocalAdmin();
    const user = getLocalUserById(userId);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
      cachedAt: Date.now(),
    };
  }
}

export async function getCurrentUserFromRequest(request: NextRequest | Request) {
  const token = "cookies" in request
    ? (request as NextRequest).cookies.get(AUTH_COOKIE)?.value
    : cookieFromHeader(request, AUTH_COOKIE);
  if (!token) return null;
  const payload = parseSessionToken(token);
  if (!payload) return null;
  const state = await readUserState(payload.id);
  if (!state?.isActive) return null;
  if (state.tokenVersion !== payload.tokenVersion) return null;
  return {
    id: state.id,
    username: state.username,
    role: state.role,
    tokenVersion: state.tokenVersion,
  } satisfies CurrentUser;
}

export async function requireUser(request: NextRequest | Request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return { response: fail("请先登录", 401), user: null };
  return { response: null, user };
}

export async function requireAdmin(request: NextRequest | Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth;
  if (auth.user.role !== "ADMIN") return { response: fail("无权限访问", 403), user: null };
  return auth;
}

export async function findLoginUser(username: string) {
  try {
    return await prisma.user.findUnique({ where: { username } });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    seedLocalAdmin();
    return getLocalUserByUsername(username);
  }
}
