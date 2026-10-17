// DRAKIDION Function Builders
// Builder functions that create tasks from simple functions
import type { DrakidionTask } from './drakidion-types.js';
import { newReadyTask, createSucceededTask, createDeadTask } from './task-factories.js';

/**
 * Function type that takes no parameters and returns a Partial<DrakidionTask>
 * This is the expected signature for functions passed to the builder
 */
export type TaskFunction = () => Partial<DrakidionTask>;

/**
 * Builder that takes a function and creates a ready task that calls the function in its process property
 * The function is expected to return a Partial<DrakidionTask>, which gets merged with the base task
 * 
 * @param description - Human-readable description of the task
 * @param fn - Function that returns a Partial<DrakidionTask>
 * @returns A ready DrakidionTask that will execute the function
 */
export const createTaskFromFunction = (
  description: string,
  fn: TaskFunction
): DrakidionTask => {
  const baseTask = newReadyTask(description);
  
  return {
    ...baseTask,
    process: (): DrakidionTask => {
      try {
        // Call the function to get the partial task (synchronously)
        const partialTask = fn();
        
        // Create a succeeded task by merging the partial task with the base task
        const succeededTask = createSucceededTask(baseTask);
        
        // Merge the partial task properties with the succeeded task
        const result = {
          ...succeededTask,
          ...partialTask,
          // Ensure we don't override critical fields
          taskId: succeededTask.taskId,
          version: succeededTask.version,
          doneAt: succeededTask.doneAt,
          status: partialTask.status || 'succeeded',
        };
        
        return result;
      } catch (error) {
        // If the function throws, create a dead task
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const deadTask = createDeadTask(baseTask);
        return {
          ...deadTask,
          work: `${baseTask.work}\n[Function failed: ${errorMessage}]`,
        };
      }
    },
  };
};

