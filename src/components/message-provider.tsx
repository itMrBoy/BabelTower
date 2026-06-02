"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

type MessageType = "success" | "error" | "warning" | "info";

interface MessageItem {
  id: string;
  type: MessageType;
  content: string;
}

interface MessageContextValue {
  message: {
    success: (content: string) => void;
    error: (content: string) => void;
    warning: (content: string) => void;
    info: (content: string) => void;
  };
}

const MessageContext = createContext<MessageContextValue | null>(null);

export function MessageProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<MessageItem[]>([]);

  const remove = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const add = useCallback(
    (type: MessageType, content: string) => {
      const id = Math.random().toString(36).slice(2);
      setMessages((prev) => [...prev, { id, type, content }]);
      setTimeout(() => {
        remove(id);
      }, type === "error" || type === "warning" ? 6000 : 3000);
    },
    [remove]
  );

  const value = useMemo(
    () => ({
      message: {
        success: (c: string) => add("success", c),
        error: (c: string) => add("error", c),
        warning: (c: string) => add("warning", c),
        info: (c: string) => add("info", c),
      },
    }),
    [add]
  );

  return (
    <MessageContext.Provider value={value}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`pointer-events-auto max-w-[min(760px,calc(100vw-32px))] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium leading-6 transition-all duration-300 animate-[slideIn_0.2s_ease-out] ${
              m.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : m.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : m.type === "warning"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}
          >
            {m.content}
          </div>
        ))}
      </div>
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error("useMessage must be used within MessageProvider");
  return ctx.message;
}
