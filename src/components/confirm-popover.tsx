"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Tone = "default" | "danger";

interface ConfirmPopoverProps {
  /** 触发元素，通常是一个按钮。组件会监听其点击事件打开气泡。 */
  children: React.ReactElement<{
    onClick?: (event: React.MouseEvent) => void;
    ref?: React.Ref<HTMLElement>;
  }>;
  /** 气泡内的确认提示文字，支持多行 ReactNode。 */
  title: React.ReactNode;
  /** 点击确定后的回调，支持 async；返回的 Promise resolve 前气泡保持 loading。 */
  onConfirm: () => void | Promise<void>;
  /** 确定按钮配色，danger 显示为红色，用于删除等危险操作。 */
  tone?: Tone;
  /** 确定按钮文案，默认「确定」。 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」。 */
  cancelText?: string;
  /** 外部 disabled，禁用时点击触发元素不弹出气泡。 */
  disabled?: boolean;
}

const BUBBLE_WIDTH = 240;

// 气泡相对触发元素定位：默认在按钮下方右对齐，下方空间不足时翻转到上方。
// 气泡通过 Portal 渲染在 body，使用 fixed 定位，因此基于视口坐标计算。
function computePosition(rect: DOMRect, bubbleHeight: number) {
  const margin = 8;
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < bubbleHeight + margin * 2 && rect.top > bubbleHeight + margin * 2;
  const top = placeAbove ? rect.bottom - rect.height - bubbleHeight - margin : rect.bottom + margin;
  // 右对齐按钮右边缘，并保证不超出视口左右边界。
  const left = Math.min(
    Math.max(margin, rect.right - BUBBLE_WIDTH),
    window.innerWidth - BUBBLE_WIDTH - margin,
  );
  return { top, left };
}

export default function ConfirmPopover({
  children,
  title,
  onConfirm,
  tone = "default",
  confirmText = "确定",
  cancelText = "取消",
  disabled = false,
}: ConfirmPopoverProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Portal 仅在客户端挂载后渲染，避免 SSR 阶段访问 document。
  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
  }, [busy]);

  // 打开后等布局稳定再测量按钮与气泡，计算最终位置。
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const anchor = anchorRef.current;
        const bubble = bubbleRef.current;
        if (!anchor || !bubble) return;
        setPos(computePosition(anchor.getBoundingClientRect(), bubble.offsetHeight));
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);

  // 点击外部或按 ESC 关闭；滚动/缩放时同步关闭，避免气泡悬空。
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (bubbleRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  // 克隆触发元素，注入 ref 和点击打开逻辑，保留其原有 onClick。
  const trigger = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const { ref } = children.props;
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onClick: (event: React.MouseEvent) => {
      children.props.onClick?.(event);
      if (event.defaultPrevented || disabled) return;
      setOpen((current) => !current);
    },
  });

  const bubble = open ? (
    <div
      ref={bubbleRef}
      role="dialog"
      aria-modal="false"
      style={{
        position: "fixed",
        width: BUBBLE_WIDTH,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // 首帧位置未算出前隐藏，避免左上角闪现。
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-[9998] rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] animate-[slideIn_0.16s_ease-out]"
    >
      <div className="flex gap-2.5">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold ${
            tone === "danger" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
          }`}
        >
          !
        </span>
        <div className="text-sm leading-6 text-slate-700">{title}</div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          disabled={busy}
          onClick={close}
        >
          {cancelText}
        </button>
        <button
          type="button"
          className={`h-8 rounded-lg px-3 text-sm font-semibold text-white transition disabled:opacity-60 ${
            tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-slate-800 hover:bg-slate-900"
          }`}
          disabled={busy}
          onClick={() => void handleConfirm()}
        >
          {busy ? "处理中..." : confirmText}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {trigger}
      {mounted && bubble ? createPortal(bubble, document.body) : null}
    </>
  );
}
