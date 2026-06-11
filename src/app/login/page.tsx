"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useMessage } from "@/components/message-provider";
import { PasswordInput } from "@/components/password-input";
import { requestJson } from "@/lib/http-client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refresh } = useAuth();
  const message = useMessage();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const next = searchParams.get("next") || "/";
  // 会话被其他设备登录顶下线（单会话互踢），跳转登录页时由 reason=superseded 标记。
  const superseded = searchParams.get("reason") === "superseded";

  useEffect(() => {
    if (user) router.replace(next);
  }, [next, router, user]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await requestJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      await refresh();
      router.replace(next);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={submit}>
        {superseded ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            该账号已在其他设备登录，当前会话已下线。如非本人操作，请尽快修改密码。
          </div>
        ) : null}
        <div className="mb-6 flex items-center gap-3">
          <img src="/babeltower-icon.svg" alt="BabelTower" className="h-10 w-10 rounded-lg bg-white" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">BabelTower 登录</h1>
            <p className="text-sm text-slate-500">使用账号密码进入工作台</p>
          </div>
        </div>
        <label className="mb-3 block text-sm text-slate-600">
          用户名
          <input
            className="mt-1"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="mb-5 block text-sm text-slate-600">
          密码
          <PasswordInput
            className="mt-1"
            value={password}
            placeholder="请输入密码"
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <button className="primary wide" type="submit" disabled={busy}>
          {busy ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}
