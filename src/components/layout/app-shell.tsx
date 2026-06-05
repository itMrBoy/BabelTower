"use client";

import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import { MessageProvider } from "@/components/message-provider";

function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const isLoginPage = pathname === "/login";

  // 首次校验登录态时给一个中性骨架占位，避免先闪系统骨架再跳登录页。
  if (loading) {
    return <div className="h-screen w-screen bg-slate-100" />;
  }

  // 默认进登录页：未登录（或在登录页）只渲染登录布局，已登录才渲染系统骨架。
  if (isLoginPage || !user) {
    return <main className="min-h-screen w-screen bg-slate-100">{isLoginPage ? children : null}</main>;
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto bg-slate-100">{children}</main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MessageProvider>
      <AuthProvider>
        <ShellLayout>{children}</ShellLayout>
      </AuthProvider>
    </MessageProvider>
  );
}
