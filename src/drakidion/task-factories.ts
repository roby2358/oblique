// DRAKIDION Task Factory Functions
// Factory functions that create tasks with closure-based behavior
import type { DrakidionTask, ConversationMessage } from './drakidion-types.js';
import type { LLMClient } from '../hooks/llm/llm-client.js';
import { generateTaskId } from '../utils/index.js';

/**
 * Helper to create a new ready task with initial values and defaults
 * Starts a new task chain with a fresh taskId and version 1
 * Use with spread operator: { ...newReadyTask(description), work, process }
 * 
 * For successor tasks in a chain, use nextTask() instead.
 */
export const newReadyTask = (description: string) => {
  return {
    taskId: generateTaskId(),
    version: 1,
    status: 'ready' as const,
    description,
    work: '',
    conversation: undefined as ConversationMessage[] | undefined,
    createdAt: new Date(),
    process: async (): Promise<DrakidionTask> => {
      throw new Error('Task process not implemented');
    },
  };
};

/**
 * Helper to create a new waiting task with initial values and defaults
 * Starts a new task chain with a fresh taskId and version 1
 * Use with spread operator: { ...newWaitingTask(description), work, onSuccess, onError }
 * 
 * For successor tasks in a chain, use nextTask() instead.
 */
export const newWaitingTask = (description: string) => {
  return {
    taskId: generateTaskId(),
    version: 1,
    status: 'waiting' as const,
    description,
    work: 'Waiting...',
    conversation: undefined as ConversationMessage[] | undefined,
    createdAt: new Date(),
    process: async (): Promise<DrakidionTask> => {
      throw new Error('Waiting tasks should not be processed directly');
    },
    onSuccess: undefined as ((result: any) => DrakidionTask) | undefined,
    onError: undefined as ((error: any) => DrakidionTask) | undefined,
  };
};

/**
 * Helper to create the base successor task object
 * Returns common fields: taskId, version (+1), description, work, createdAt, and stub process
 */
export const nextTask = (task: DrakidionTask): Omit<DrakidionTask, 'doneAt' | 'onSuccess' | 'onError'> => {
  return {
    taskId: task.taskId,
    version: task.version + 1,
    // make sure to set the status to something alive
    status: 'dead',
    description: task.description,
    work: task.work,
    conversation: task.conversation,
    createdAt: task.createdAt,
    process: async () => {
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
 * Create a task that processes an Oblique message with an LLM
 * This applies the Oblique prompt transformation before calling the LLM.
 * This creates a waiting task and initiates the LLM call immediately.
 * The onComplete callback is called when the LLM responds (success or error).
 */
export const createObliqueMessageTask = (
  message: string,
  llmClient: LLMClient,
  createPrompt: (message: string) => string,
  onComplete: (taskId: string, result?: any, error?: any) => void,
  options?: {
    temperature?: number;
    conversation?: ConversationMessage[];
  }
): DrakidionTask => {
  const taskId = generateTaskId();
  const conversation = options?.conversation || [];
  const createdAt = new Date();
  
  // Add user message to conversation
  const updatedConversation: ConversationMessage[] = [
    ...conversation,
    { source: 'user', text: message },
  ];
  
  // Generate Oblique prompt
  const prompt = createPrompt(message);
  
  // Initiate the LLM call immediately
  llmClient.generateResponse({
    prompt,
    temperature: options?.temperature ?? 0.8,
  })
    .then(response => {
      // Call onComplete with the response
      onComplete(taskId, response);
    })
    .catch(error => {
      // Call onComplete with the error
      onComplete(taskId, undefined, error);
    });
  
  // Return waiting task with callbacks
  const task: DrakidionTask = {
    taskId,
    version: 1,
    status: 'waiting',
    description: `Oblique: ${message.substring(0, 40)}${message.length > 40 ? '...' : ''}`,
    work: 'Waiting for LLM response...',
    conversation: updatedConversation,
    createdAt,
    process: async () => {
      throw new Error('Waiting tasks should not be processed directly');
    },
    onSuccess: (result: any) => {
      // Add assistant response to conversation
      const finalConversation: ConversationMessage[] = [
        ...updatedConversation,
        { source: 'assistant', text: result.content },
      ];
      
      // Return succeeded task with response
      return {
        taskId,
        version: 2,
        status: 'succeeded',
        description: `Oblique: ${message.substring(0, 40)}${message.length > 40 ? '...' : ''}`,
        work: result.content,
        conversation: finalConversation,
        createdAt,
        doneAt: new Date(),
        process: async () => {
          throw new Error('Task already completed');
        },
      };
    },
    onError: (error: any) => {
      // Return dead task on error
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        taskId,
        version: 2,
        status: 'dead',
        description: `Oblique: ${message.substring(0, 40)}${message.length > 40 ? '...' : ''}`,
        work: `Error: ${errorMsg}`,
        conversation: updatedConversation,
        createdAt,
        doneAt: new Date(),
        process: async () => {
          throw new Error('Task failed');
        },
      };
    },
  };
  
  return task;
};
