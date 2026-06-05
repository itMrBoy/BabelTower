"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useMessage } from "@/components/message-provider";
import { PasswordInput } from "@/components/password-input";
import { requestJson } from "@/lib/http-client";

export default function AccountPage() {
  const { user, refresh, logout } = useAuth();
  const message = useMessage();
  const [username, setUsername] = useState(user?.username ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await requestJson("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          ...(password ? { currentPassword, password } : {}),
        }),
      });
      if (password) {
        // 改密后端已使当前会话 Cookie 失效，前端须立即登出并跳转登录页，
        // 否则停留在原页面会造成「看似已登录、实际所有请求 401」的错觉。
        setCurrentPassword("");
        setPassword("");
        message.success("密码已修改，请使用新密码重新登录。");
        await logout();
        return;
      }
      await refresh();
      message.success("账号信息已更新。");
      setCurrentPassword("");
      setPassword("");
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-slate-900">个人设置</h1>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <label className="text-sm text-slate-600">
            用户名
            <input className="mt-1" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-600">
              当前密码
              <PasswordInput
                className="mt-1"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className="text-sm text-slate-600">
              新密码
              <PasswordInput
                className="mt-1"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="至少 6 位，含大小写、数字、特殊字符"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "保存中..." : "保存设置"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
