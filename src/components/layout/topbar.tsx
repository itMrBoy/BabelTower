"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GlobeIcon } from "@/components/icons";

const pageTitles: Record<string, string> = {
  "/": "上传 & 解析",
  "/conflicts": "冲突处理",
  "/dictionary": "字典检索",
  "/snapshots": "任务快照",
  "/export": "导出配置",
  "/account": "个人设置",
  "/users": "用户管理",
  "/settings": "系统配置",
};

export default function TopBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const title = pageTitles[pathname] ?? "BabelTower";
  const avatar = user?.username.slice(0, 1).toUpperCase() ?? "U";

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
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
            {avatar}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium text-slate-700">{user?.username ?? "未登录"}</p>
            <p className="text-[11px] text-slate-400">{user?.role === "ADMIN" ? "管理员" : "维护者"}</p>
          </div>
        </div>
        <button
          type="button"
          className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
          onClick={() => void logout()}
        >
          退出
        </button>
      </div>
    </header>
  );
}
