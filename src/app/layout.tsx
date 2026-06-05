import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/app-shell";

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
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
