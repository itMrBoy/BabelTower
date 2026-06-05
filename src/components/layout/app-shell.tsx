"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/auth-provider";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import { MessageProvider } from "@/components/message-provider";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <MessageProvider>
      <AuthProvider>
        {isLoginPage ? (
          <main className="min-h-screen w-screen bg-slate-100">{children}</main>
        ) : (
          <div className="h-screen w-screen flex overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-auto bg-slate-100">{children}</main>
            </div>
          </div>
        )}
      </AuthProvider>
    </MessageProvider>
  );
}
