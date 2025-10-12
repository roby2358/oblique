// DRAKIDION types
// This file defines types for the DRAKIDION task orchestration system

/**
 * Task status values as defined in DRAKIDION spec
 */
export type TaskStatus = 
  | 'ready'      // Task is queued and ready to process
  | 'running'    // Task is currently being processed
  | 'waiting'    // Task is waiting for async response
  | 'succeeded'  // Task completed successfully
  | 'retry'      // Task failed but will retry
  | 'dead'       // Task failed permanently
  | 'canceled';  // Task was canceled

/**
 * Conversation message for LLM interactions
 */
export interface ConversationMessage {
  source: string;
  text: string;
}

/**
 * DRAKIDION Task - immutable snapshot representing one version of task state
 * Tasks are created by factory functions (closures) that encapsulate behavior
 */
export interface DrakidionTask {
  /** 24-character safe-base32 taskId */
  taskId: string;
  
  /** Version number, incremented when task creates successor */
  version: number;
  
  /** Current status */
  status: TaskStatus;
  
  /** Human-readable description of the task */
  description: string;
  
  /** Work product being built (e.g., document, tweet) */
  work: string;
  
  /** Process function that returns a promise resolving to successor task */
  process: () => Promise<DrakidionTask>;
  
  /** Optional: Conversation history with LLM */
  conversation?: ConversationMessage[];
  
  /** Optional: Retry counter */
  retryCount?: number;
  
  /** Optional: Success callback returning successor task */
  onSuccess?: (result: any) => DrakidionTask;
  
  /** Optional: Error callback returning successor task */
  onError?: (error: any) => DrakidionTask;
}

/**
 * Task factory function type - creates task objects with closure-based behavior
 */
export type TaskFactory = () => DrakidionTask;

/**
 * TaskMap - mutable map holding latest task snapshot per taskId
 */
export interface TaskMap {
  tasks: Map<string, DrakidionTask>;
}

/**
 * TaskQueue - FIFO queue holding taskIds with status='ready'
 */
export interface TaskQueue {
  taskIds: string[];
}

/**
 * WaitingMap - maps correlationId to taskId for tasks with status='waiting'
 */
export interface WaitingMap {
  correlations: Map<string, string>; // correlationId -> taskId
}

/**
 * Orchestrator state
 */
export interface OrchestratorState {
  taskMap: TaskMap;
  taskQueue: TaskQueue;
  waitingMap: WaitingMap;
  isRunning: boolean;
}

