// DRAKIDION Orchestrator - single worker loop for task processing
import type { DrakidionTask, OrchestratorState } from './drakidion-types.js';
import * as TaskMapOps from './task-map.js';
import * as TaskQueueOps from './task-queue.js';
import * as WaitingMapOps from './waiting-map.js';

/**
 * Create a new Orchestrator state
 */
export const createOrchestrator = (): OrchestratorState => ({
  taskMap: TaskMapOps.createTaskMap(),
  taskQueue: TaskQueueOps.createTaskQueue(),
  waitingMap: WaitingMapOps.createWaitingMap(),
  isRunning: false,
});

/**
 * Add a task to the orchestrator
 * The task is added to taskMap, and if status is 'ready', also added to taskQueue
 * If status is 'waiting', it's added to waitingMap using taskId as the key
 */
export const addTask = (
  state: OrchestratorState, 
  task: DrakidionTask
): OrchestratorState => {
  // Add to taskMap
  TaskMapOps.setTask(state.taskMap, task);
  
  // Route based on status
  if (task.status === 'ready') {
    TaskQueueOps.enqueue(state.taskQueue, task.taskId);
  } else if (task.status === 'waiting') {
    // For waiting tasks, use taskId as the correlation key
    WaitingMapOps.addCorrelation(state.waitingMap, task.taskId, task.taskId);
  }
  
  return state;
};

/**
 * Transition a task to a new state
 * This replaces the old task in taskMap and updates queue/waiting structures accordingly
 */
export const transitionTask = (
  state: OrchestratorState,
  oldTaskId: string,
  newTask: DrakidionTask
): OrchestratorState => {
  // Remove old task from queue if it was there
  if (TaskQueueOps.contains(state.taskQueue, oldTaskId)) {
    TaskQueueOps.remove(state.taskQueue, oldTaskId);
  }
  
  // Remove old task from waitingMap if it was there
  WaitingMapOps.removeByTaskId(state.waitingMap, oldTaskId);
  
  // Add new task
  return addTask(state, newTask);
};

/**
 * Process the next task in the queue
 * Returns the updated state and the result of processing
 */
export const processNextTask = async (
  state: OrchestratorState
): Promise<{ state: OrchestratorState; processed: boolean }> => {
  // Get next taskId from queue
  const taskId = TaskQueueOps.dequeue(state.taskQueue);
  
  if (!taskId) {
    return { state, processed: false };
  }
  
  // Get task from taskMap
  const task = TaskMapOps.getTask(state.taskMap, taskId);
  
  if (!task) {
    console.warn(`Task ${taskId} not found in taskMap`);
    return { state, processed: false };
  }
  
  // Check status - should be 'ready' if coming from queue
  if (task.status !== 'ready') {
    console.warn(`Task ${taskId} has status ${task.status}, expected 'ready'`);
    return { state, processed: false };
  }
  
  try {
    // Update task status to 'running'
    const runningTask: DrakidionTask = {
      ...task,
      status: 'running',
      version: task.version,
    };
    TaskMapOps.setTask(state.taskMap, runningTask);
    
    // Process the task - calls task.process()
    const successorTask = await task.process();
    
    // Transition to successor task
    state = transitionTask(state, taskId, successorTask);
    
    console.log(`Processed task ${taskId} -> status: ${successorTask.status}`);
    
    return { state, processed: true };
  } catch (error) {
    console.error(`Error processing task ${taskId}:`, error);
    
    // Create error task
    const errorTask: DrakidionTask = {
      ...task,
      status: 'dead',
      version: task.version + 1,
      work: task.work + `\n[ERROR: ${error instanceof Error ? error.message : 'Unknown error'}]`,
    };
    
    TaskMapOps.setTask(state.taskMap, errorTask);
    
    return { state, processed: true };
  }
};

/**
 * Process all tasks in the queue until empty
 */
export const processAllTasks = async (state: OrchestratorState): Promise<OrchestratorState> => {
  while (!TaskQueueOps.isEmpty(state.taskQueue)) {
    const result = await processNextTask(state);
    state = result.state;
    
    if (!result.processed) {
      break;
    }
  }
  
  return state;
};

/**
 * Start the orchestrator loop
 * Uses requestAnimationFrame for browser-friendly scheduling
 */
export const startLoop = (
  state: OrchestratorState,
  onStateChange?: (state: OrchestratorState) => void
): { state: OrchestratorState; stop: () => void } => {
  if (state.isRunning) {
    console.warn('Orchestrator is already running');
    return { state, stop: () => {} };
  }
  
  state.isRunning = true;
  let stopRequested = false;
  
  const loop = async () => {
    if (stopRequested) {
      state.isRunning = false;
      return;
    }
    
    // Process one task
    if (!TaskQueueOps.isEmpty(state.taskQueue)) {
      const result = await processNextTask(state);
      state = result.state;
      
      if (onStateChange) {
        onStateChange(state);
      }
    }
    
    // Schedule next iteration
    requestAnimationFrame(loop);
  };
  
  // Start the loop
  requestAnimationFrame(loop);
  
  return {
    state,
    stop: () => {
      stopRequested = true;
      state.isRunning = false;
    },
  };
};

/**
 * Resume a waiting task by taskId with a successor task
 * Finds the task in waitingMap, removes it, and transitions to successor
 */
export const resumeWaitingTask = (
  state: OrchestratorState,
  taskId: string,
  successorTask: DrakidionTask
): OrchestratorState => {
  // Get task from taskMap
  const task = TaskMapOps.getTask(state.taskMap, taskId);
  
  if (!task) {
    console.warn(`Task ${taskId} not found in taskMap`);
    WaitingMapOps.removeCorrelation(state.waitingMap, taskId);
    return state;
  }
  
  // Remove from waitingMap
  WaitingMapOps.removeCorrelation(state.waitingMap, taskId);
  
  // Transition to successor task
  return transitionTask(state, taskId, successorTask);
};

/**
 * Handle error for a waiting task by taskId with a successor task
 */
export const errorWaitingTask = (
  state: OrchestratorState,
  taskId: string,
  successorTask: DrakidionTask
): OrchestratorState => {
  // Get task from taskMap
  const task = TaskMapOps.getTask(state.taskMap, taskId);
  
  if (!task) {
    console.warn(`Task ${taskId} not found in taskMap`);
    WaitingMapOps.removeCorrelation(state.waitingMap, taskId);
    return state;
  }
  
  // Remove from waitingMap
  WaitingMapOps.removeCorrelation(state.waitingMap, taskId);
  
  // Transition to successor task
  return transitionTask(state, taskId, successorTask);
};

/**
 * Get orchestrator status
 */
export const getStatus = (state: OrchestratorState) => ({
  isRunning: state.isRunning,
  queueSize: TaskQueueOps.size(state.taskQueue),
  waitingSize: WaitingMapOps.size(state.waitingMap),
  totalTasks: TaskMapOps.size(state.taskMap),
});

