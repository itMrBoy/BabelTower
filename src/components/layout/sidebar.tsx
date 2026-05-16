"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CloudUploadIcon,
  LightningIcon,
  SearchIcon,
  CameraIcon,
  SettingsIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  badge?: () => Promise<number>;
}

const navItems: NavItem[] = [
  { href: "/", label: "Upload & Parse", icon: (p) => <CloudUploadIcon {...p} /> },
  { href: "/conflicts", label: "Conflict Handling", icon: (p) => <LightningIcon {...p} /> },
  { href: "/dictionary", label: "Dictionary Search", icon: (p) => <SearchIcon {...p} /> },
  { href: "/snapshots", label: "Task Snapshots", icon: (p) => <CameraIcon {...p} /> },
  { href: "/export", label: "Export Config", icon: (p) => <SettingsIcon {...p} /> },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const [conflictCount, setConflictCount] = useState<number | null>(null);

  // Poll the current-task conflict count for the conflicts badge.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        if (typeof window === "undefined") return;
        const raw = window.localStorage.getItem("babeltower:current-task");
        if (!raw) {
          setConflictCount(null);
          return;
        }
        const parsed = JSON.parse(raw) as { id?: string };
        if (!parsed?.id) return;
        const response = await fetch(`/api/tasks/${encodeURIComponent(parsed.id)}/history`);
        if (!response.ok) {
          setConflictCount(null);
          return;
        }
        const body = await response.json();
        const summary = body.items?.[0]?.conflictSummary ?? null;
        const total =
          (summary?.blocking ?? 0) + (summary?.warning ?? 0);
        if (!cancelled) setConflictCount(total > 0 ? total : null);
      } catch {
        if (!cancelled) setConflictCount(null);
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 15000);
    const handler = () => void refresh();
    window.addEventListener("babeltower:current-task-changed", handler);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("babeltower:current-task-changed", handler);
    };
  }, []);

  return (
    <aside className="hidden md:flex w-60 flex-shrink-0 flex-col bg-sidebar-bg text-sidebar-text">
      <div className="px-6 pt-6 pb-5">
        <Link href="/" className="block">
          <div className="text-white text-2xl font-bold tracking-tight">
            BabelTower
          </div>
          <p className="text-xs text-sidebar-text-muted mt-0.5">
            i18n Dictionary Manager
          </p>
        </Link>
      </div>

      <p className="px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-text-muted/80 mt-2">
        Navigation
      </p>

      <nav className="mt-3 flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/conflicts" && conflictCount != null && conflictCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors " +
                (active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-sidebar-text hover:bg-white/5 hover:text-white")
              }
            >
              <Icon size={18} className={active ? "text-white" : "text-sidebar-text-muted group-hover:text-white"} />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="inline-flex min-w-[1.5rem] justify-center bg-red-500 text-white text-[11px] px-1.5 py-0.5 rounded-full font-semibold">
                  {conflictCount! > 99 ? "99+" : conflictCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 mt-4 border-t border-white/10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-500 text-white grid place-items-center text-xs font-bold">
          ZG
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white font-medium leading-tight">赵刚</p>
          <p className="text-xs text-sidebar-text-muted leading-tight mt-0.5">UI Designer</p>
        </div>
      </div>
    </aside>
  );
}
