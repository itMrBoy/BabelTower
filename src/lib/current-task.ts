"use client";

export interface CurrentTask {
  id: string;
  name: string;
  format: string;
  status: string;
  latestVersion: number;
  projectId?: string;
}

let currentTask: CurrentTask | null = null;
const listeners = new Set<(task: CurrentTask | null) => void>();

export function readCurrentTask(): CurrentTask | null {
  return currentTask;
}

export function writeCurrentTask(task: CurrentTask | null): void {
  currentTask = task;
  listeners.forEach((listener) => listener(currentTask));
}

export function subscribeCurrentTask(callback: (task: CurrentTask | null) => void): () => void {
  listeners.add(callback);
  callback(currentTask);
  return () => {
    listeners.delete(callback);
  };
}
