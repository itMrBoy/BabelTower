import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";

export const metadata: Metadata = {
  title: "BabelTower · i18n Dictionary Manager",
  description: "Chinese-first i18n dictionary import, conflict check, and export workflow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="h-screen flex overflow-hidden bg-slate-100 text-slate-900 antialiased">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto bg-slate-100 scrollbar-thin">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
