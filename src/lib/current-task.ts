"use client";

const STORAGE_KEY = "babeltower:current-task";
const EVENT_NAME = "babeltower:current-task-changed";

export interface CurrentTask {
  id: string;
  name: string;
  format: string;
  status: string;
  latestVersion: number;
  projectId?: string;
}

export function readCurrentTask(): CurrentTask | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CurrentTask;
    if (parsed && typeof parsed.id === "string" && parsed.id.length > 0) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeCurrentTask(task: CurrentTask | null): void {
  if (typeof window === "undefined") return;
  if (task === null) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(task));
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function subscribeCurrentTask(callback: (task: CurrentTask | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback(readCurrentTask());
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
