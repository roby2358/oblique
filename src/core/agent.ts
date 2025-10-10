// Core agent orchestrator
import type { Task, UserId, ConversationId, LLMRequest } from '../types/index.js';
import type { Queue } from './queue.js';
import type { PendingMap } from './pending-map.js';
import type { Storage } from '../storage/storage-interface.js';
import type { LLMClient } from '../hooks/llm/llm-client.js';
import type { BlueskyClient } from '../hooks/bluesky/bluesky-client.js';

import * as QueueOps from './queue.js';
import * as PendingOps from './pending-map.js';
import { generateId, generateConversationId } from '../utils/index.js';
import { createObliquePrompt } from '../prompts/oblique.js';

export interface AgentConfig {
  storage: Storage;
  llmClient?: LLMClient;
  blueskyClient?: BlueskyClient;
  autoSave?: boolean;
}

/**
 * Agent worker class that manages task processing and orchestration.
 * Uses functional data structures internally for queue and pending map.
 */
export class AgentWorker {
  private queue: Queue;
  private pendingMap: PendingMap;
  private config: AgentConfig;

  private constructor(queue: Queue, pendingMap: PendingMap, config: AgentConfig) {
    this.queue = queue;
    this.pendingMap = pendingMap;
    this.config = config;
  }

  /**
   * Create a new AgentWorker instance
   */
  static async create(config: AgentConfig): Promise<AgentWorker> {
    // Try to load existing state
    const savedState = await config.storage.load();
    
    if (savedState) {
      return new AgentWorker(savedState.queue, savedState.pendingMap, config);
    }

    return new AgentWorker(
      QueueOps.createQueue(),
      PendingOps.createPendingMap(),
      config
    );
  }

  /**
   * Add a task to the queue
   */
  addTask(task: Task): this {
    this.queue = QueueOps.enqueue(this.queue, task);
    return this;
  }

  /**
   * Process the next task in the queue
   */
  async processNextTask(): Promise<this> {
    const [task, newQueue] = QueueOps.dequeue(this.queue);
    
    if (!task) {
      return this;
    }

    this.queue = newQueue;

    try {
      // Process task based on type
      switch (task.type) {
        case 'process_message': {
          // Initial message processing
          const { message } = task.payload as { userId: UserId; message: string };
          
          if (!this.config.llmClient) {
            // No LLM configured - create error response task
            const responseTask: Task = {
              id: generateId(),
              conversationId: task.conversationId,
              type: 'return_response',
              payload: { response: '[LLM not configured]' },
              createdAt: new Date(),
              onComplete: task.onComplete,
            };
            this.queue = QueueOps.enqueue(this.queue, responseTask);
            break;
          }
          
          // Generate prompt and create LLM request task
          const prompt = createObliquePrompt(message);
          const llmRequestTask: Task = {
            id: generateId(),
            conversationId: task.conversationId,
            type: 'send_llm_request',
            payload: { prompt, temperature: 0.8 },
            createdAt: new Date(),
            onComplete: task.onComplete,
          };
          
          // Add to pending map and queue
          this.queue = QueueOps.enqueue(this.queue, llmRequestTask);
          this.pendingMap = PendingOps.addPending(this.pendingMap, {
            id: llmRequestTask.id,
            conversationId: llmRequestTask.conversationId,
            taskType: llmRequestTask.type,
            createdAt: llmRequestTask.createdAt,
            timeoutAt: new Date(Date.now() + 30000), // 30 second timeout
          });
          break;
        }
        
        case 'send_llm_request': {
          // Execute LLM request
          const { prompt, temperature } = task.payload as { prompt: string; temperature?: number };
          
          if (!this.config.llmClient) {
            // Remove from pending
            this.pendingMap = PendingOps.removePending(this.pendingMap, task.id);
            break;
          }
          
          const llmRequest: LLMRequest = { prompt, temperature };
          
          try {
            const response = await this.config.llmClient.generateResponse(llmRequest);
            
            // Remove from pending map
            this.pendingMap = PendingOps.removePending(this.pendingMap, task.id);
            
            // Create response task
            const responseTask: Task = {
              id: generateId(),
              conversationId: task.conversationId,
              type: 'return_response',
              payload: { response: response.content },
              createdAt: new Date(),
              onComplete: task.onComplete,
            };
            
            this.queue = QueueOps.enqueue(this.queue, responseTask);
          } catch (error) {
            // Remove from pending on error
            this.pendingMap = PendingOps.removePending(this.pendingMap, task.id);
            
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const errorTask: Task = {
              id: generateId(),
              conversationId: task.conversationId,
              type: 'return_response',
              payload: { response: `[Error: ${errorMsg}]` },
              createdAt: new Date(),
              onComplete: task.onComplete,
            };
            
            this.queue = QueueOps.enqueue(this.queue, errorTask);
          }
          break;
        }
        
        case 'return_response': {
          // Final step - call completion callback if provided
          const { response } = task.payload as { response: string };
          
          if (task.onComplete) {
            task.onComplete(response);
          }
          break;
        }
        
        case 'send_bluesky_post': {
          // Handle Bluesky posting (future implementation)
          console.log('Bluesky post task:', task.payload);
          break;
        }
        
        default:
          console.warn(`Unknown task type: ${task.type}`);
      }

      // Save state if auto-save is enabled
      if (this.config.autoSave) {
        await this.config.storage.save({
          queue: this.queue,
          pendingMap: this.pendingMap,
        });
      }

    } catch (error) {
      console.error(`Error processing task ${task.id}:`, error);
    }

    return this;
  }

  /**
   * Process all tasks in the queue
   */
  async processAllTasks(): Promise<this> {
    // Process all tasks currently in queue
    while (!QueueOps.isEmpty(this.queue)) {
      await this.processNextTask();
    }
    
    return this;
  }

  /**
   * Process a message and add it to the queue
   */
  processMessage(
    userId: UserId,
    message: string,
    onComplete?: (result: unknown) => void
  ): ConversationId {
    // Generate unique conversation ID
    const conversationId = generateConversationId();
    
    // Create initial task for this conversation
    const task: Task = {
      id: generateId(),
      conversationId,
      type: 'process_message',
      payload: { userId, message },
      createdAt: new Date(),
      onComplete,
    };
    
    // Add task to queue
    this.queue = QueueOps.enqueue(this.queue, task);
    
    return conversationId;
  }

  /**
   * Process a message and wait for the response
   */
  async processMessageAndWait(userId: UserId, message: string): Promise<string> {
    return new Promise((resolve) => {
      // Create message with completion callback
      this.processMessage(userId, message, (result) => {
        resolve(result as string);
      });
      
      // Process all tasks asynchronously
      this.processAllTasks().then(() => {
        // If callback wasn't called, resolve with error
        resolve('[No response received]');
      });
    });
  }

  /**
   * Get current agent status
   */
  getStatus(): { queueSize: number; pendingTasks: number } {
    return {
      queueSize: QueueOps.size(this.queue),
      pendingTasks: PendingOps.size(this.pendingMap),
    };
  }
}
