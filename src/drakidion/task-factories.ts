// DRAKIDION Task Factory Functions
// Factory functions that create tasks with closure-based behavior
import type { DrakidionTask, ConversationMessage } from './drakidion-types.js';
import type { LLMClient } from '../hooks/llm/llm-client.js';
import { generateTaskId } from '../utils/index.js';

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
