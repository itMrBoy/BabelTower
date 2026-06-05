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

// 进程内用户状态缓存存活时间。clearUserStateCache 仍会在写操作（封禁/改密）时即时失效；
// 此 TTL 仅为兜底，防止绕过 API 直接改库导致缓存长期陈旧。设 0 则每次都查库。
export const USER_STATE_CACHE_TTL_MS = Number(process.env.USER_STATE_CACHE_TTL_MS ?? 60_000);

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
  // 命中也要判 TTL：过期则 fall through 重新查库，避免缓存长期陈旧（如绕过 API 直改 DB）。
  if (cached && Date.now() - cached.cachedAt < USER_STATE_CACHE_TTL_MS) return cached;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, isActive: true, tokenVersion: true },
    });
    if (!user) {
      // 用户已被删除：清掉残留缓存条目，避免旧值继续命中。
      userCache().delete(userId);
      return null;
    }
    const state: CachedUserState = { ...user, cachedAt: Date.now() };
    userCache().set(user.id, state);
    return state;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    // 降级分支不写入 userCache()：local-store 是单进程内存权威源、本就实时；
    // 若写进主缓存，DB 恢复后会在 TTL 内继续读到陈旧的 local 状态。
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
