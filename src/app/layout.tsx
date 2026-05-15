import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BabelTower",
  description: "Chinese-first i18n dictionary import, conflict check, and export workflow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
