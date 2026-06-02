import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import { MessageProvider } from "@/components/message-provider";

export const metadata: Metadata = {
  title: "BabelTower",
  description: "Chinese-first i18n dictionary import, conflict check, and export workflow.",
  icons: {
    icon: "/babeltower-icon.svg",
    shortcut: "/babeltower-icon.svg",
    apple: "/babeltower-icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="h-screen flex overflow-hidden">
        <MessageProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-auto bg-slate-100">
              {children}
            </main>
          </div>
        </MessageProvider>
      </body>
    </html>
  );
}
