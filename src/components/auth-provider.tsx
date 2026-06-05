"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, type ApiUser } from "@/lib/http-client";

type AuthContextValue = {
  user: ApiUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

async function readUser() {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { user?: ApiUser };
  return body.user ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  // loading 只表达「首屏首次校验尚未完成」；导航与手动 refresh 都不会再把它翻回 true。
  const [loading, setLoading] = useState(true);
  const didInitRef = useRef(false);

  // refresh 只负责「拉一次用户写入 state」，不碰 loading、不读 pathname、不就地重定向。
  // 依赖为空 => 引用在会话期间稳定 => 切菜单不会让它重建、不会触发全屏 loading。
  const refresh = useCallback(async () => {
    const nextUser = await readUser();
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.replace("/login");
  }, [router]);

  // 首屏首次校验：仅挂载时跑一次，与 pathname 完全脱钩。didInitRef + cancelled 守 StrictMode 双挂载与竞态。
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const nextUser = await readUser();
        if (!cancelled) setUser(nextUser);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 重定向守卫：唯一读 pathname 的地方，但只调 router.replace、不碰 loading，故不会触发全屏白屏。
  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== "/login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  // 会话中途过期：清空 user，跳转交给上面的守卫 effect 接管。
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
    };
    window.addEventListener("babeltower:auth-expired", onExpired);
    return () => window.removeEventListener("babeltower:auth-expired", onExpired);
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

