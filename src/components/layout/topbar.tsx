"use client";

import { usePathname } from "next/navigation";
import { GlobeIcon } from "@/components/icons";

const pageTitles: Record<string, string> = {
  "/": "上传 & 解析",
  "/conflicts": "冲突处理",
  "/dictionary": "字典检索",
  "/snapshots": "任务快照",
  "/export": "导出配置",
};

export default function TopBar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "BabelTower";

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="font-semibold text-lg text-slate-800">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md">
          <GlobeIcon size={16} />
          <span>zh-CN → en-US</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
          Z
        </div>
      </div>
    </header>
  );
}
