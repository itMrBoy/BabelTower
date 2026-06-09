"use client";

export interface CurrentTask {
  id: string;
  name: string;
  format: string;
  status: string;
  latestVersion: number;
  projectId?: string;
}

export interface CurrentTaskDraftRow {
  key: string;
  rowKey: string;
  rowIndex: number;
  keyPath: string[];
  sourceValue?: string | null;
  translatedValue?: string | null;
  status?: string;
  conflictLevel?: "blocking" | "warning" | "info" | null;
}

export interface CurrentTaskDraftBuffer {
  taskId: string;
  baseVersion: number;
  rows: CurrentTaskDraftRow[];
}

let currentTask: CurrentTask | null = null;
let currentTaskDraftBuffer: CurrentTaskDraftBuffer | null = null;
const listeners = new Set<(task: CurrentTask | null) => void>();

export function readCurrentTask(): CurrentTask | null {
  return currentTask;
}

export function writeCurrentTask(task: CurrentTask | null): void {
  currentTask = task;
  if (!task || currentTaskDraftBuffer?.taskId !== task.id) {
    currentTaskDraftBuffer = null;
  }
  listeners.forEach((listener) => listener(currentTask));
}

export function readCurrentTaskDraftBuffer(taskId?: string): CurrentTaskDraftBuffer | null {
  if (taskId && currentTaskDraftBuffer?.taskId !== taskId) return null;
  return currentTaskDraftBuffer;
}

export function writeCurrentTaskDraftBuffer(buffer: CurrentTaskDraftBuffer | null): void {
  currentTaskDraftBuffer = buffer;
}

export function clearCurrentTaskDraftBuffer(taskId?: string): void {
  if (!taskId || currentTaskDraftBuffer?.taskId === taskId) {
    currentTaskDraftBuffer = null;
  }
}

export function subscribeCurrentTask(callback: (task: CurrentTask | null) => void): () => void {
  listeners.add(callback);
  callback(currentTask);
  return () => {
    listeners.delete(callback);
  };
}
