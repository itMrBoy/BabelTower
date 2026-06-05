"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useMessage } from "@/components/message-provider";
import ConfirmPopover from "@/components/confirm-popover";
import { requestJson } from "@/lib/http-client";

type UserRow = {
  id: string;
  username: string;
  role: "ADMIN" | "MAINTAINER";
  isActive: boolean;
  createdAt: string;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function UsersPage() {
  const { user } = useAuth();
  const message = useMessage();
  const [items, setItems] = useState<UserRow[]>([]);
  const [username, setUsername] = useState("");
  const [isActive, setIsActive] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams();
    if (username.trim()) params.set("username", username.trim());
    if (isActive) params.set("isActive", isActive);
    const response = await requestJson<{ items: UserRow[] }>(`/api/users?${params.toString()}`);
    setItems(response.items);
  }

  useEffect(() => {
    void load().catch((error) => message.error(error instanceof Error ? error.message : String(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser() {
    if (!newUsername.trim()) {
      message.error("用户名不能为空。");
      return;
    }
    setBusy("create");
    try {
      const response = await requestJson<{ user: UserRow; password: string }>("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      setCreatedPassword(response.password);
      setNewUsername("");
      setItems((current) => [response.user, ...current]);
      message.success("维护者已创建，随机密码仅本次返回。");
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function setActive(target: UserRow, nextActive: boolean) {
    setBusy(target.id);
    try {
      const response = await requestJson<{ user: UserRow }>(`/api/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      setItems((current) => current.map((item) => (item.id === target.id ? response.user : item)));
      message.success(`用户已${nextActive ? "启用" : "禁用"}。`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function deleteUser(target: UserRow) {
    setBusy(target.id);
    try {
      await requestJson(`/api/users/${target.id}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== target.id));
      message.success("用户已删除。");
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function copyCreatedPassword() {
    if (!createdPassword) return;
    try {
      await navigator.clipboard.writeText(createdPassword);
      message.success("密码已复制。");
    } catch {
      message.error("复制失败，请手动复制密码。");
    }
  }

  if (user?.role !== "ADMIN") {
    return <div className="p-6 text-sm text-slate-500">无权限访问用户管理。</div>;
  }

  return (
    <div className="p-6">
      <div className="mx-auto space-y-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="新增维护者账号" />
            <button className="primary" type="button" disabled={busy === "create"} onClick={() => void createUser()}>
              {busy === "create" ? "创建中..." : "新增维护者"}
            </button>
          </div>
          {createdPassword ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <span>一次性密码：<strong className="font-mono">{createdPassword}</strong></span>
              <button className="ghost" type="button" onClick={() => void copyCreatedPassword()}>
                复制密码
              </button>
            </div>
          ) : null}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="按用户名筛选" />
            <select aria-label="状态筛选" value={isActive} onChange={(event) => setIsActive(event.target.value)}>
              <option value="">全部状态</option>
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
            <button className="ghost" type="button" onClick={() => void load()}>
              筛选
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th>用户名</th>
                <th>角色</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.username}</td>
                  <td>{item.role === "ADMIN" ? "管理员" : "维护者"}</td>
                  <td>{item.isActive ? "启用" : "禁用"}</td>
                  <td>{formatTime(item.createdAt)}</td>
                  <td>
                    {item.role === "ADMIN" ? (
                      <span className="text-sm text-slate-400">管理员账号受保护</span>
                    ) : (
                      <div className="flex gap-2">
                        <ConfirmPopover
                          title={<>确定{item.isActive ? "禁用" : "启用"}用户「{item.username}」吗？</>}
                          confirmText={item.isActive ? "禁用" : "启用"}
                          tone={item.isActive ? "danger" : "default"}
                          disabled={busy === item.id}
                          onConfirm={() => setActive(item, !item.isActive)}
                        >
                          <button className="ghost" type="button" disabled={busy === item.id}>
                            {item.isActive ? "禁用" : "启用"}
                          </button>
                        </ConfirmPopover>
                        <ConfirmPopover
                          title={<>确定删除用户「{item.username}」吗？有关联业务数据时后端会拒绝删除。</>}
                          confirmText="删除"
                          tone="danger"
                          disabled={busy === item.id}
                          onConfirm={() => deleteUser(item)}
                        >
                          <button className="ghost danger" type="button" disabled={busy === item.id}>
                            删除
                          </button>
                        </ConfirmPopover>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
