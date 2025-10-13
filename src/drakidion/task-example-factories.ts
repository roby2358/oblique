// DRAKIDION Example Task Factories
// Example factory functions for testing and demonstration purposes
import type { DrakidionTask, ConversationMessage } from './drakidion-types.js';
import type { LLMClient } from '../hooks/llm/llm-client.js';
import { generateTaskId } from '../utils/index.js';

/**
 * Create a task that processes a message with an LLM
 * This creates a waiting task and initiates the LLM call immediately.
 * The onComplete callback is called when the LLM responds (success or error).
 */
export const createLLMTask = (
  message: string,
  llmClient: LLMClient,
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
  
  // Initiate the LLM call immediately
  llmClient.generateResponse({
    prompt: message,
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
    description: `LLM: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
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
        description: `LLM: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
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
        description: `LLM: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
        work: `Error: ${errorMsg}`,
        conversation: updatedConversation,
        retryCount: 0,
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

/**
 * Create a simple example task that increments work
 */
export const createIncrementTask = (initialValue: number = 0, createdAt?: Date): DrakidionTask => {
  const taskId = generateTaskId();
  const work = `Count: ${initialValue}`;
  const taskCreatedAt = createdAt || new Date();
  
  return {
    taskId,
    version: 1,
    status: 'ready',
    description: 'Increment counter task',
    work,
    createdAt: taskCreatedAt,
    process: async () => {
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const nextValue = initialValue + 1;
      
      // Return successor task
      if (nextValue < 5) {
        // Continue incrementing
        return createIncrementTask(nextValue, taskCreatedAt);
      } else {
        // Done
        return {
          taskId,
          version: 2,
          status: 'succeeded',
          description: 'Increment counter task',
          work: `Count: ${nextValue} (completed)`,
          createdAt: taskCreatedAt,
          doneAt: new Date(),
          process: async () => {
            throw new Error('Task already completed');
          },
        };
      }
    },
  };
};

/**
 * Create a task that waits for an async response
 * This demonstrates the waiting/callback pattern
 */
export const createWaitingTask = (
  taskId: string = generateTaskId(),
  onComplete?: (result: any) => void
): DrakidionTask => {
  const createdAt = new Date();
  
  return {
    taskId,
    version: 1,
    status: 'waiting',
    description: 'Waiting for async response',
    work: 'Waiting for async response...',
    createdAt,
    process: async () => {
      throw new Error('Waiting tasks should not be processed directly');
    },
    onSuccess: (result: any) => {
      if (onComplete) {
        onComplete(result);
      }
      
      return {
        taskId,
        version: 2,
        status: 'succeeded',
        description: 'Waiting for async response',
        work: `Completed with result: ${JSON.stringify(result)}`,
        createdAt,
        doneAt: new Date(),
        process: async () => {
          throw new Error('Task already completed');
        },
      };
    },
    onError: (error: any) => {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        taskId,
        version: 2,
        status: 'dead',
        description: 'Waiting for async response',
        work: `Failed with error: ${errorMsg}`,
        createdAt,
        doneAt: new Date(),
        process: async () => {
          throw new Error('Task failed');
        },
      };
    },
  };
};

/**
 * Create a task that retries on failure
 */
export const createRetryTask = (
  operation: () => Promise<string>,
  maxRetries: number = 3,
  retryCount: number = 0,
  createdAt?: Date
): DrakidionTask => {
  const taskId = generateTaskId();
  const taskCreatedAt = createdAt || new Date();
  
  return {
    taskId,
    version: retryCount + 1,
    status: 'ready',
    description: 'Retry task',
    work: retryCount > 0 ? `Retry attempt ${retryCount}/${maxRetries}` : 'Initial attempt',
    retryCount,
    createdAt: taskCreatedAt,
    process: async () => {
      try {
        const result = await operation();
        
        return {
          taskId,
          version: retryCount + 2,
          status: 'succeeded',
          description: 'Retry task',
          work: result,
          retryCount,
          createdAt: taskCreatedAt,
          doneAt: new Date(),
          process: async () => {
            throw new Error('Task already completed');
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        if (retryCount < maxRetries) {
          // Retry
          return createRetryTask(operation, maxRetries, retryCount + 1, taskCreatedAt);
        } else {
          // Give up
          return {
            taskId,
            version: retryCount + 2,
            status: 'dead',
            description: 'Retry task',
            work: `Failed after ${maxRetries} retries: ${errorMsg}`,
            retryCount,
            createdAt: taskCreatedAt,
            doneAt: new Date(),
            process: async () => {
              throw new Error('Task failed');
            },
          };
        }
      }
    },
  };
};

/**
 * Create a chain of tasks that execute sequentially
 */
export const createTaskChain = (
  operations: Array<() => Promise<string>>,
  currentIndex: number = 0,
  results: string[] = [],
  createdAt?: Date
): DrakidionTask => {
  const taskId = generateTaskId();
  const taskCreatedAt = createdAt || new Date();
  
  if (currentIndex >= operations.length) {
    // All operations complete
    return {
      taskId,
      version: currentIndex + 1,
      status: 'succeeded',
      description: `Task chain (${operations.length} steps)`,
      work: results.join('\n'),
      createdAt: taskCreatedAt,
      doneAt: new Date(),
      process: async () => {
        throw new Error('Task already completed');
      },
    };
  }
  
  return {
    taskId,
    version: currentIndex + 1,
    status: 'ready',
    description: `Task chain (step ${currentIndex + 1}/${operations.length})`,
    work: results.join('\n'),
    createdAt: taskCreatedAt,
    process: async () => {
      try {
        const result = await operations[currentIndex]();
        const newResults = [...results, result];
        
        // Create next task in chain
        return createTaskChain(operations, currentIndex + 1, newResults, taskCreatedAt);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        return {
          taskId,
          version: currentIndex + 2,
          status: 'dead',
          description: `Task chain (step ${currentIndex + 1}/${operations.length})`,
          work: `Failed at step ${currentIndex + 1}: ${errorMsg}`,
          createdAt: taskCreatedAt,
          doneAt: new Date(),
          process: async () => {
            throw new Error('Task failed');
          },
        };
      }
    },
  };
};

