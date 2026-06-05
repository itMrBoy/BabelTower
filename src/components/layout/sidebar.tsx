"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  UploadIcon,
  AlertTriangleIcon,
  SearchIcon,
  ClockIcon,
  DownloadIcon,
  RefreshCwIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "上传 & 解析", icon: <UploadIcon size={18} /> },
  {
    href: "/conflicts",
    label: "冲突处理",
    icon: <AlertTriangleIcon size={18} />,
    badge: 0,
  },
  { href: "/dictionary", label: "字典检索", icon: <SearchIcon size={18} /> },
  { href: "/snapshots", label: "任务快照", icon: <ClockIcon size={18} /> },
  { href: "/export", label: "导出配置", icon: <DownloadIcon size={18} /> },
  { href: "/account", label: "个人设置", icon: <RefreshCwIcon size={18} /> },
  { href: "/users", label: "用户管理", icon: <SearchIcon size={18} />, adminOnly: true },
  { href: "/settings", label: "系统配置", icon: <RefreshCwIcon size={18} />, adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="w-60 bg-sidebar-bg text-sidebar-text flex flex-col flex-shrink-0">
      <div className="p-5 flex items-center gap-3 border-b border-slate-700">
        <img
          src="/babeltower-icon.svg"
          alt="BabelTower"
          className="w-9 h-9 rounded-lg bg-white object-cover"
        />
        <span className="font-semibold text-white text-base">BabelTower</span>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3">
        {navItems.filter((item) => !item.adminOnly || user?.role === "ADMIN").map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 " +
                (active
                  ? "bg-[rgba(37,99,235,0.25)] text-white border-l-[3px] border-brand-500"
                  : "hover:bg-[rgba(255,255,255,0.08)]")
              }
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? (
                <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
        BabelTower v0.1.0
      </div>
    </aside>
  );
}
