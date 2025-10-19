// WaitingSet - set of taskIds for tasks with status='waiting'
import type { WaitingSet } from './drakidion-types.js';

/**
 * Create a new WaitingSet
 */
export const createWaitingSet = (): WaitingSet => ({
  waitingTaskIds: new Set(),
});

/**
 * Add a taskId to the waiting set
 */
export const addWaitingTask = (set: WaitingSet, taskId: string): WaitingSet => {
  set.waitingTaskIds.add(taskId);
  return set;
};

/**
 * Check if a taskId is waiting
 */
export const isWaiting = (set: WaitingSet, taskId: string): boolean => {
  return set.waitingTaskIds.has(taskId);
};

/**
 * Remove a taskId from the waiting set
 */
export const removeWaitingTask = (set: WaitingSet, taskId: string): WaitingSet => {
  set.waitingTaskIds.delete(taskId);
  return set;
};

/**
 * Get all waiting taskIds
 */
export const getAllWaitingTaskIds = (set: WaitingSet): string[] => {
  return Array.from(set.waitingTaskIds);
};

/**
 * Get the number of waiting tasks
 */
export const size = (set: WaitingSet): number => {
  return set.waitingTaskIds.size;
};

/**
 * Clear all waiting taskIds
 */
export const clear = (set: WaitingSet): WaitingSet => {
  set.waitingTaskIds.clear();
  return set;
};

