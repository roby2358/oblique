// DRAKIDION Task Factory Functions
// Factory functions that create tasks with closure-based behavior
import type { DrakidionTask } from './drakidion-types.js';
import { generateTaskId } from '../utils/index.js';

/**
 * Helper to create a new ready task with initial values and defaults
 * Starts a new task chain with a fresh taskId and version 1
 * Use with spread operator: { ...newReadyTask(description), work, process }
 * 
 * For successor tasks in a chain, use nextTask() instead.
 */
export const newReadyTask = (description: string): Omit<DrakidionTask, 'doneAt'> => {
  return {
    taskId: generateTaskId(),
    version: 1,
    createdAt: new Date(),
    status: 'ready',
    description,
    work: '',
    conversation: undefined,
    process: (): DrakidionTask => {
      throw new Error('Task process not implemented');
    },
  };
};

/**
 * Helper to create a new waiting task with initial values and defaults
 * Starts a new task chain with a fresh taskId and version 1
 * Use with spread operator: { ...newWaitingTask(description), work }
 * 
 * For successor tasks in a chain, use nextTask() instead.
 */
export const newWaitingTask = (description: string): Omit<DrakidionTask, 'doneAt'> => {
  return {
    taskId: generateTaskId(),
    version: 1,
    createdAt: new Date(),
    status: 'waiting',
    description,
    work: 'Waiting...',
    conversation: undefined,
    process: (): DrakidionTask => {
      throw new Error('Waiting tasks should not be processed directly');
    },
  };
};

/**
 * Helper to create the base successor task object
 * Returns common fields: taskId, version (+1), description, work, createdAt, and stub process
 */
export const nextTask = (task: DrakidionTask): Omit<DrakidionTask, 'doneAt'> => {
  return {
    taskId: task.taskId,
    version: task.version + 1,
    status: 'ready',
    description: task.description,
    work: task.work,
    conversation: task.conversation,
    createdAt: task.createdAt,
    process: () => {
      throw new Error('Task already completed');
    },
  };
};

/**
 * General helper to create a succeeded version of any task
 */
export const createSucceededTask = (
  task: DrakidionTask
): DrakidionTask => {
  return {
    ...nextTask(task),
    status: 'succeeded',
    doneAt: new Date(),
  };
};

/**
 * General helper to create a succeeded version of any task
 */
export const createDeadTask = (
  task: DrakidionTask
): DrakidionTask => {
  return {
    ...nextTask(task),
    status: 'dead',
    doneAt: new Date(),
  };
};
