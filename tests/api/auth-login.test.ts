import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

const DB_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "admin",
  passwordHash: "hash",
  role: "ADMIN",
  isActive: true,
  tokenVersion: 3,
};

function dbUnavailable() {
  const error = new Error("Can't reach database server") as Error & { code?: string };
  error.code = "P1001";
  return error;
}

function loginRequest(body = { username: "admin", password: "Snow@123" }) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cookieTokenFromResponse(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/babeltower_session=([^;]+)/);
  return match?.[1] ?? null;
}

function decodeTokenPayload(token: string) {
  const [encoded] = token.split(".");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    id: string;
    tokenVersion: number;
    exp: number;
  };
}

function requestWithToken(token: string) {
  return new Request("http://localhost/api/auth/me", {
    headers: { cookie: `babeltower_session=${token}` },
  });
}

describe("auth login single-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置进程级缓存与降级存储，避免用例间互相污染。
    const globals = globalThis as typeof globalThis & {
      __babelTowerUserStateCache?: Map<string, unknown>;
      __babelTowerLocalStore?: unknown;
    };
    delete globals.__babelTowerUserStateCache;
    delete globals.__babelTowerLocalStore;
    mocks.verifyPassword.mockResolvedValue(true);
  });

  it("login bumps tokenVersion and signs token with the new version", async () => {
    mocks.findUnique.mockResolvedValue({ ...DB_USER });
    mocks.update.mockResolvedValue({ tokenVersion: DB_USER.tokenVersion + 1 });

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(loginRequest() as never);

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DB_USER.id },
        data: { tokenVersion: { increment: 1 } },
      }),
    );
    const token = cookieTokenFromResponse(response);
    expect(token).toBeTruthy();
    expect(decodeTokenPayload(token!).tokenVersion).toBe(DB_USER.tokenVersion + 1);
  });

  it("rejects superseded token with explicit reason after a newer login", async () => {
    const { createSessionToken, requireUser } = await import("@/lib/auth");
    // 旧会话的 token 带版本 3，而库里已被新登录顶到 4。
    const staleToken = createSessionToken({
      id: DB_USER.id,
      username: DB_USER.username,
      role: "ADMIN",
      tokenVersion: 3,
    });
    mocks.findUnique.mockResolvedValue({ ...DB_USER, tokenVersion: 4 });

    const auth = await requireUser(requestWithToken(staleToken));

    expect(auth.user).toBeNull();
    expect(auth.response?.status).toBe(401);
    expect(auth.response?.headers.get("x-auth-reason")).toBe("superseded");
    const body = (await auth.response?.json()) as { error: { message: string } };
    expect(body.error.message).toContain("该账号已在其他设备登录");
  });

  it("accepts token whose version matches current state", async () => {
    const { createSessionToken, requireUser } = await import("@/lib/auth");
    const freshToken = createSessionToken({
      id: DB_USER.id,
      username: DB_USER.username,
      role: "ADMIN",
      tokenVersion: 4,
    });
    mocks.findUnique.mockResolvedValue({ ...DB_USER, tokenVersion: 4 });

    const auth = await requireUser(requestWithToken(freshToken));

    expect(auth.response).toBeNull();
    expect(auth.user).toMatchObject({ id: DB_USER.id, tokenVersion: 4 });
  });

  it("missing token still returns plain unauthenticated message", async () => {
    const { requireUser } = await import("@/lib/auth");

    const auth = await requireUser(new Request("http://localhost/api/auth/me"));

    expect(auth.response?.status).toBe(401);
    expect(auth.response?.headers.get("x-auth-reason")).toBeNull();
    const body = (await auth.response?.json()) as { error: { message: string } };
    expect(body.error.message).toBe("请先登录");
  });

  it("falls back to local store bump when database is unavailable", async () => {
    mocks.findUnique.mockRejectedValue(dbUnavailable());
    mocks.update.mockRejectedValue(dbUnavailable());

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(loginRequest() as never);

    expect(response.status).toBe(200);
    const token = cookieTokenFromResponse(response);
    expect(token).toBeTruthy();
    // 降级 seed 的 admin 初始 tokenVersion=1，登录互踢后应为 2。
    expect(decodeTokenPayload(token!).tokenVersion).toBe(2);

    const { getLocalUserByUsername } = await import("@/lib/local-store");
    expect(getLocalUserByUsername("admin")?.tokenVersion).toBe(2);
  });
});
