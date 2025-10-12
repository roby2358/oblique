// TaskQueue - FIFO queue holding taskIds with status='ready'
import type { TaskQueue } from './drakidion-types.js';

/**
 * Create a new TaskQueue
 */
export const createTaskQueue = (): TaskQueue => ({
  taskIds: [],
});

/**
 * Add a taskId to the end of the queue
 */
export const enqueue = (queue: TaskQueue, taskId: string): TaskQueue => {
  queue.taskIds.push(taskId);
  return queue;
};

/**
 * Remove and return the first taskId from the queue
 */
export const dequeue = (queue: TaskQueue): string | undefined => {
  return queue.taskIds.shift();
};

/**
 * View the first taskId without removing it
 */
export const peek = (queue: TaskQueue): string | undefined => {
  return queue.taskIds[0];
};

/**
 * Check if the queue is empty
 */
export const isEmpty = (queue: TaskQueue): boolean => {
  return queue.taskIds.length === 0;
};

/**
 * Get the number of taskIds in the queue
 */
export const size = (queue: TaskQueue): number => {
  return queue.taskIds.length;
};

/**
 * Remove a specific taskId from the queue (if present)
 */
export const remove = (queue: TaskQueue, taskId: string): TaskQueue => {
  queue.taskIds = queue.taskIds.filter(id => id !== taskId);
  return queue;
};

/**
 * Check if a taskId is in the queue
 */
export const contains = (queue: TaskQueue, taskId: string): boolean => {
  return queue.taskIds.includes(taskId);
};

/**
 * Get all taskIds
 */
export const getAllTaskIds = (queue: TaskQueue): string[] => {
  return [...queue.taskIds];
};

/**
 * Clear the queue
 */
export const clear = (queue: TaskQueue): TaskQueue => {
  queue.taskIds = [];
  return queue;
};

