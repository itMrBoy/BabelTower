"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const isLoginPage = pathname === "/login";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextUser = await readUser();
      setUser(nextUser);
      if (!nextUser && !isLoginPage) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    } finally {
      setLoading(false);
    }
  }, [isLoginPage, pathname, router]);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
    };
    window.addEventListener("babeltower:auth-expired", onExpired);
    return () => window.removeEventListener("babeltower:auth-expired", onExpired);
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);

  if (!isLoginPage && loading) {
    return (
      <div className="grid h-screen w-screen place-items-center bg-slate-100 text-sm text-slate-500">
        正在校验登录状态...
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

