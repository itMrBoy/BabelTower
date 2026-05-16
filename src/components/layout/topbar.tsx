"use client";

import { usePathname } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";

const pageTitles: Record<string, string> = {
  "/": "Upload & Parse",
  "/conflicts": "Conflict Handling",
  "/dictionary": "Dictionary",
  "/snapshots": "Task Snapshots",
  "/export": "Export Configuration",
};

function titleFor(pathname: string) {
  if (pathname === "/") return pageTitles["/"];
  for (const key of Object.keys(pageTitles)) {
    if (key !== "/" && (pathname === key || pathname.startsWith(`${key}/`))) {
      return pageTitles[key];
    }
  }
  return "BabelTower";
}

export default function TopBar() {
  const pathname = usePathname();
  const title = titleFor(pathname);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
      <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 text-sm font-mono text-slate-700 bg-white">
          <span>zh-CN</span>
          <ArrowRightIcon size={14} className="text-brand-500" />
          <span>en-US</span>
        </div>
      </div>
    </header>
  );
}
