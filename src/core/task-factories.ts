// DRAKIDION Task Factory Functions
// Factory functions that create tasks with closure-based behavior
import type { DrakidionTask, ConversationMessage } from './drakidion-types.js';
import type { LLMClient } from '../hooks/llm/llm-client.js';
import { generateTaskId } from '../utils/index.js';

/**
 * Create a simple example task that increments work
 */
export const createIncrementTask = (initialValue: number = 0): DrakidionTask => {
  const taskId = generateTaskId();
  const work = `Count: ${initialValue}`;
  
  return {
    taskId,
    version: 1,
    status: 'ready',
    work,
    process: async () => {
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const nextValue = initialValue + 1;
      
      // Return successor task
      if (nextValue < 5) {
        // Continue incrementing
        return createIncrementTask(nextValue);
      } else {
        // Done
        return {
          taskId,
          version: 2,
          status: 'succeeded',
          work: `Count: ${nextValue} (completed)`,
          process: async () => {
            throw new Error('Task already completed');
          },
        };
      }
    },
  };
};

/**
 * Create a task that processes a message with an LLM
 */
export const createLLMTask = (
  message: string,
  llmClient: LLMClient,
  options?: {
    temperature?: number;
    conversation?: ConversationMessage[];
  }
): DrakidionTask => {
  const taskId = generateTaskId();
  const conversation = options?.conversation || [];
  
  // Add user message to conversation
  const updatedConversation: ConversationMessage[] = [
    ...conversation,
    { source: 'user', text: message },
  ];
  
  return {
    taskId,
    version: 1,
    status: 'ready',
    work: '',
    conversation: updatedConversation,
    process: async () => {
      try {
        // Call LLM
        const response = await llmClient.generateResponse({
          prompt: message,
          temperature: options?.temperature ?? 0.8,
        });
        
        // Add assistant response to conversation
        const finalConversation: ConversationMessage[] = [
          ...updatedConversation,
          { source: 'assistant', text: response.content },
        ];
        
        // Return succeeded task with response
        return {
          taskId,
          version: 2,
          status: 'succeeded',
          work: response.content,
          conversation: finalConversation,
          process: async () => {
            throw new Error('Task already completed');
          },
        };
      } catch (error) {
        // Return retry or dead task
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        return {
          taskId,
          version: 2,
          status: 'dead',
          work: `Error: ${errorMsg}`,
          conversation: updatedConversation,
          retryCount: 0,
          process: async () => {
            throw new Error('Task failed');
          },
        };
      }
    },
  };
};

/**
 * Create a task that processes an Oblique message with an LLM
 * This applies the Oblique prompt transformation before calling the LLM
 */
export const createObliqueMessageTask = (
  message: string,
  llmClient: LLMClient,
  createPrompt: (message: string) => string,
  options?: {
    temperature?: number;
    conversation?: ConversationMessage[];
  }
): DrakidionTask => {
  const taskId = generateTaskId();
  const conversation = options?.conversation || [];
  
  // Add user message to conversation
  const updatedConversation: ConversationMessage[] = [
    ...conversation,
    { source: 'user', text: message },
  ];
  
  // Generate Oblique prompt
  const prompt = createPrompt(message);
  
  return {
    taskId,
    version: 1,
    status: 'ready',
    work: '',
    conversation: updatedConversation,
    process: async () => {
      try {
        // Call LLM with Oblique prompt
        const response = await llmClient.generateResponse({
          prompt,
          temperature: options?.temperature ?? 0.8,
        });
        
        // Add assistant response to conversation
        const finalConversation: ConversationMessage[] = [
          ...updatedConversation,
          { source: 'assistant', text: response.content },
        ];
        
        // Return succeeded task with response
        return {
          taskId,
          version: 2,
          status: 'succeeded',
          work: response.content,
          conversation: finalConversation,
          process: async () => {
            throw new Error('Task already completed');
          },
        };
      } catch (error) {
        // Return dead task on error
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        return {
          taskId,
          version: 2,
          status: 'dead',
          work: `Error: ${errorMsg}`,
          conversation: updatedConversation,
          process: async () => {
            throw new Error('Task failed');
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
  return {
    taskId,
    version: 1,
    status: 'waiting',
    work: 'Waiting for async response...',
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
        work: `Completed with result: ${JSON.stringify(result)}`,
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
        work: `Failed with error: ${errorMsg}`,
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
  retryCount: number = 0
): DrakidionTask => {
  const taskId = generateTaskId();
  
  return {
    taskId,
    version: retryCount + 1,
    status: 'ready',
    work: retryCount > 0 ? `Retry attempt ${retryCount}/${maxRetries}` : 'Initial attempt',
    retryCount,
    process: async () => {
      try {
        const result = await operation();
        
        return {
          taskId,
          version: retryCount + 2,
          status: 'succeeded',
          work: result,
          retryCount,
          process: async () => {
            throw new Error('Task already completed');
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        if (retryCount < maxRetries) {
          // Retry
          return createRetryTask(operation, maxRetries, retryCount + 1);
        } else {
          // Give up
          return {
            taskId,
            version: retryCount + 2,
            status: 'dead',
            work: `Failed after ${maxRetries} retries: ${errorMsg}`,
            retryCount,
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
  results: string[] = []
): DrakidionTask => {
  const taskId = generateTaskId();
  
  if (currentIndex >= operations.length) {
    // All operations complete
    return {
      taskId,
      version: currentIndex + 1,
      status: 'succeeded',
      work: results.join('\n'),
      process: async () => {
        throw new Error('Task already completed');
      },
    };
  }
  
  return {
    taskId,
    version: currentIndex + 1,
    status: 'ready',
    work: results.join('\n'),
    process: async () => {
      try {
        const result = await operations[currentIndex]();
        const newResults = [...results, result];
        
        // Create next task in chain
        return createTaskChain(operations, currentIndex + 1, newResults);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        return {
          taskId,
          version: currentIndex + 2,
          status: 'dead',
          work: `Failed at step ${currentIndex + 1}: ${errorMsg}`,
          process: async () => {
            throw new Error('Task failed');
          },
        };
      }
    },
  };
};

