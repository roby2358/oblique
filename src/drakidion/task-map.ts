// TaskMap - mutable in-memory map of taskId -> latest task snapshot
import type { DrakidionTask, TaskMap } from './drakidion-types.js';

/**
 * Create a new TaskMap
 */
export const createTaskMap = (): TaskMap => ({
  tasks: new Map(),
});

/**
 * Add or update a task in the map (replaces previous version)
 */
export const setTask = (map: TaskMap, task: DrakidionTask): TaskMap => {
  map.tasks.set(task.taskId, task);
  return map;
};

/**
 * Get a task by taskId
 */
export const getTask = (map: TaskMap, taskId: string): DrakidionTask | undefined => {
  return map.tasks.get(taskId);
};

/**
 * Remove a task from the map
 */
export const removeTask = (map: TaskMap, taskId: string): TaskMap => {
  map.tasks.delete(taskId);
  return map;
};

/**
 * Check if a task exists
 */
export const hasTask = (map: TaskMap, taskId: string): boolean => {
  return map.tasks.has(taskId);
};

/**
 * Get all tasks
 */
export const getAllTasks = (map: TaskMap): DrakidionTask[] => {
  return Array.from(map.tasks.values());
};

/**
 * Get all tasks with a specific status
 */
export const getTasksByStatus = (map: TaskMap, status: DrakidionTask['status']): DrakidionTask[] => {
  return getAllTasks(map).filter(task => task.status === status);
};

/**
 * Get the number of tasks in the map
 */
export const size = (map: TaskMap): number => {
  return map.tasks.size;
};

/**
 * Clear all tasks
 */
export const clear = (map: TaskMap): TaskMap => {
  map.tasks.clear();
  return map;
};

