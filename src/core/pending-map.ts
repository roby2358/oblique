// Pending tasks map for async operations
import type { PendingTask, TaskId } from '../types/index.js';

export interface PendingMap {
  readonly pending: ReadonlyMap<TaskId, PendingTask>;
}

export const createPendingMap = (): PendingMap => ({
  pending: new Map(),
});

export const addPending = (map: PendingMap, task: PendingTask): PendingMap => {
  const newPending = new Map(map.pending);
  newPending.set(task.id, task);
  return { pending: newPending };
};

export const removePending = (map: PendingMap, taskId: TaskId): PendingMap => {
  const newPending = new Map(map.pending);
  newPending.delete(taskId);
  return { pending: newPending };
};

export const getPending = (map: PendingMap, taskId: TaskId): PendingTask | undefined => {
  return map.pending.get(taskId);
};

export const hasPending = (map: PendingMap, taskId: TaskId): boolean => {
  return map.pending.has(taskId);
};

export const getAllPending = (map: PendingMap): PendingTask[] => {
  return Array.from(map.pending.values());
};

export const getExpiredPending = (map: PendingMap, now: Date = new Date()): PendingTask[] => {
  return getAllPending(map).filter(
    task => task.timeoutAt && task.timeoutAt <= now
  );
};

export const size = (map: PendingMap): number => {
  return map.pending.size;
};

