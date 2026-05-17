"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { useMessage } from "@/components/message-provider";

interface DictEntry {
  id: string;
  chineseText: string;
  englishText: string;
  tags: string[];
  note: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

type Field = "auto" | "chinese" | "english";

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function DictionaryPage() {
  const [query, setQuery] = useState("");
  const [field, setField] = useState<Field>("auto");
  const [items, setItems] = useState<DictEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const message = useMessage();
  const [hasSearched, setHasSearched] = useState(false);
  const [tagFilter, setTagFilter] = useState("all");

  const search = useCallback(async (q: string, f: Field) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setItems([]);
      setHasSearched(false);
            return;
    }
    setLoading(true);
        try {
      const url = `/api/dictionaries?q=${encodeURIComponent(trimmed)}&field=${f}&limit=100`;
      const response = await fetch(url);
      const text = await response.text();
      const body = text ? (JSON.parse(text) as { items?: DictEntry[]; error?: { message?: string } }) : {};
      if (!response.ok) {
        const message = body.error?.message ?? `请求失败 (HTTP ${response.status})`;
        throw new Error(message);
      }
      setItems(body.items ?? []);
      setHasSearched(true);
    } catch (err) {
      setItems([]);
      setHasSearched(true);
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce: refetch when the query/field changes after a short delay.
  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      setHasSearched(false);
            return;
    }
    const timer = window.setTimeout(() => {
      void search(query, field);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, field, search]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const entry of items) {
      for (const tag of entry.tags ?? []) set.add(tag);
    }
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (tagFilter === "all") return items;
    return items.filter((entry) => (entry.tags ?? []).includes(tagFilter));
  }, [items, tagFilter]);

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Search & Filter Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <form
            className="flex gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void search(query, field);
            }}
          >
            <div className="flex-1 relative">
              <SearchIcon size={18} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索 Dictionary：输入中文基准或英文译文..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
              />
            </div>
            <select
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 outline-none w-[140px] flex-shrink-0 whitespace-nowrap"
              value={field}
              onChange={(event) => setField(event.target.value as Field)}
              aria-label="搜索字段"
            >
              <option value="auto">中英自动匹配</option>
              <option value="chinese">仅中文</option>
              <option value="english">仅英文</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-60 whitespace-nowrap flex-shrink-0"
              disabled={loading}
            >
              {loading ? "搜索中..." : "搜索"}
            </button>
          </form>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-600 outline-none whitespace-nowrap"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              aria-label="标签筛选"
            >
              <option value="all">所有标签</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500 self-center ml-2">
              {hasSearched ? `共 ${filtered.length} 条记录` : "输入关键字开始检索"}
            </span>
          </div>
        </div>


        {/* Dictionary Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0 z-10">
                <tr>
                  <th className="text-left px-5 py-3 font-medium w-[260px] whitespace-nowrap">中文基准 (zh-CN)</th>
                  <th className="text-left px-5 py-3 font-medium w-[260px] whitespace-nowrap">英文译文 (en-US)</th>
                  <th className="text-left px-5 py-3 font-medium w-[160px] whitespace-nowrap">标签</th>
                  <th className="text-left px-5 py-3 font-medium w-[80px] whitespace-nowrap">使用次数</th>
                  <th className="text-left px-5 py-3 font-medium whitespace-nowrap">备注</th>
                  <th className="text-left px-5 py-3 font-medium w-[140px] whitespace-nowrap">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!hasSearched && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">
                      请输入中文或英文关键字开始检索 Dictionary。
                    </td>
                  </tr>
                )}
                {hasSearched && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">
                      未找到匹配的字典项。
                    </td>
                  </tr>
                )}
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-5 py-2.5 text-slate-800 break-all">{entry.chineseText}</td>
                    <td className="px-5 py-2.5 text-slate-700 break-all">{entry.englishText}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {(entry.tags ?? []).length === 0 ? (
                          <span className="text-slate-300 text-xs">—</span>
                        ) : (
                          (entry.tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-slate-700 font-mono text-xs">{entry.usageCount}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">
                      {entry.note ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">{formatTime(entry.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 text-xs text-slate-500">
            <span>{hasSearched ? `显示 ${filtered.length} / ${items.length} 条记录` : "等待检索"}</span>
            <span className="text-slate-400">数据源：/api/dictionaries</span>
          </div>
        </div>
      </div>
    </div>
  );
}
