"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DownloadIcon, CheckIcon, AlertTriangleIcon } from "@/components/icons";
import { readCurrentTask, subscribeCurrentTask, type CurrentTask } from "@/lib/current-task";
import {
  exportValidationMessage,
  summarizeExportValidationErrors,
} from "@/lib/export-validation";
import { apiFetch } from "@/lib/http-client";
import { useMessage } from "@/components/message-provider";

type ExportFormat = "JSON" | "PROPERTIES" | "TS";

const FORMAT_META: Record<ExportFormat, { label: string; description: string; extension: string }> = {
  JSON: { label: "JSON", description: "嵌套 i18n 文件", extension: ".json" },
  PROPERTIES: { label: ".properties", description: "Java / 后端格式", extension: ".properties" },
  TS: { label: "TS", description: "export default 对象", extension: ".ts" },
};

interface ValidationError {
  field: string;
  message: string;
}

interface ExportResponse {
  files?: Record<string, string>;
  fileBaseName?: string;
  valid?: boolean;
  validationErrors?: ValidationError[];
  error?: { message?: string };
}

function pickFormat(format: string): ExportFormat {
  if (format.toUpperCase() === "TS") return "TS";
  return format.toUpperCase() === "PROPERTIES" ? "PROPERTIES" : "JSON";
}

export default function ExportPage() {
  const [currentTask, setCurrentTask] = useState<CurrentTask | null>(null);
  const [exporting, setExporting] = useState(false);
  const message = useMessage();
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [lastExportedAt, setLastExportedAt] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTask(readCurrentTask());
    return subscribeCurrentTask(setCurrentTask);
  }, []);

  const activeFormat: ExportFormat | null = currentTask ? pickFormat(currentTask.format) : null;

  const handleExport = async () => {
    if (!currentTask) return;
    setExporting(true);
        setValidationErrors([]);
    try {
      const response = await apiFetch(`/api/tasks/${encodeURIComponent(currentTask.id)}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotVersion: currentTask.latestVersion,
          fileBaseName: currentTask.name,
        }),
      });
      const text = await response.text();
      const body = (text ? JSON.parse(text) : {}) as ExportResponse;
      if (response.status === 422 && body.validationErrors) {
        setValidationErrors(body.validationErrors);
        message.error(summarizeExportValidationErrors(body.validationErrors));
        return;
      }
      if (!response.ok) {
        throw new Error(body.error?.message ?? `请求失败 (HTTP ${response.status})`);
      }
      downloadFiles(body.files ?? {});
      setLastExportedAt(new Date());
      message.success(`已下载源文件和译文文件，共 ${Object.keys(body.files ?? {}).length} 个文件。`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const downloadFiles = (nextFiles: Record<string, string>) => {
    for (const [filename, content] of Object.entries(nextFiles)) {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Current task banner */}
        {!currentTask ? (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 flex items-start gap-3">
            <AlertTriangleIcon size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800">尚未选择任务</p>
              <p className="text-sm text-amber-700">
                请先到 <Link href="/" className="font-medium underline">首页</Link> 导入或选择一个任务，导出操作只能针对当前任务的最新快照 (TaskSnapshot)。
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1 min-w-0">
              <p className="text-xs text-slate-500 uppercase tracking-wider">当前任务</p>
              <p className="text-sm font-semibold text-slate-800 break-all">{currentTask.name}</p>
              <p className="text-xs text-slate-500">
                ID: <span className="font-mono">{currentTask.id}</span> · 状态: {currentTask.status} · v{currentTask.latestVersion}
              </p>
            </div>
            <Link
              href="/snapshots"
              className="text-xs text-brand-600 hover:underline self-center"
            >
              切换其他任务 →
            </Link>
          </div>
        )}

        {/* Format Selection */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-sm text-slate-700">导出格式</h3>
            <p className="text-xs text-slate-500 mt-1">
              当前 MVP 支持 JSON、TS 与 .properties，导出格式与任务源格式保持一致 (API: <code className="font-mono">/api/tasks/&#123;id&#125;/export</code>)。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(FORMAT_META) as ExportFormat[]).map((value) => {
              const meta = FORMAT_META[value];
              const isActive = activeFormat === value;
              const disabled = !currentTask;
              return (
                <div
                  key={value}
                  className={
                    "border-2 rounded-lg p-4 text-center " +
                    (isActive
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 " + (disabled ? "opacity-50" : "hover:border-brand-300"))
                  }
                  aria-disabled={disabled}
                >
                  <p className="text-sm font-medium text-slate-700">{meta.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{meta.description}</p>
                  {isActive && (
                    <span className="inline-block mt-2 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                      当前任务格式
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error / validation messages */}
        {validationErrors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-amber-800">导出前校验未通过：</p>
            <p className="text-xs text-amber-700">
              请回到首页补全对应行的中文基准或英文译文后再导出。
            </p>
            <ul className="text-xs text-amber-700 list-disc list-inside space-y-1">
              {validationErrors.map((item, idx) => (
                <li key={`${item.field}-${idx}`}>
                  {exportValidationMessage(item)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Export button */}
        <div className="flex justify-end items-center gap-3 flex-wrap">
          {lastExportedAt && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2.5 rounded-lg">
              <CheckIcon size={16} />
              <span>已在 {lastExportedAt.toLocaleTimeString()} 下载源文件和译文文件</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!currentTask || exporting}
            className={
              "px-6 py-2.5 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap flex-shrink-0 " +
              (!currentTask || exporting
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-brand-500 text-white hover:bg-brand-600")
            }
          >
            <DownloadIcon size={16} />
            {exporting ? "导出中..." : "生成导出文件"}
          </button>
        </div>
      </div>
    </div>
  );
}
