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

export interface Agent {
  queue: Queue;
  pendingMap: PendingMap;
  config: AgentConfig;
}

export const createAgent = async (config: AgentConfig): Promise<Agent> => {
  // Try to load existing state
  const savedState = await config.storage.load();
  
  if (savedState) {
    return {
      ...savedState,
      config,
    };
  }

  return {
    queue: QueueOps.createQueue(),
    pendingMap: PendingOps.createPendingMap(),
    config,
  };
};

export const processMessage = (
  agent: Agent,
  userId: UserId,
  message: string,
  onComplete?: (result: unknown) => void
): [ConversationId, Agent] => {
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
  const newAgent = {
    ...agent,
    queue: QueueOps.enqueue(agent.queue, task),
  };
  
  return [conversationId, newAgent];
};

export const addTask = (agent: Agent, task: Task): Agent => {
  return {
    ...agent,
    queue: QueueOps.enqueue(agent.queue, task),
  };
};

export const processNextTask = async (agent: Agent): Promise<Agent> => {
  const [task, newQueue] = QueueOps.dequeue(agent.queue);
  
  if (!task) {
    return agent;
  }

  let newAgent = { ...agent, queue: newQueue };

  try {
    // Process task based on type
    switch (task.type) {
      case 'process_message': {
        // Initial message processing
        const { message } = task.payload as { userId: UserId; message: string };
        
        if (!newAgent.config.llmClient) {
          // No LLM configured - create error response task
          const responseTask: Task = {
            id: generateId(),
            conversationId: task.conversationId,
            type: 'return_response',
            payload: { response: '[LLM not configured]' },
            createdAt: new Date(),
            onComplete: task.onComplete,
          };
          newAgent = {
            ...newAgent,
            queue: QueueOps.enqueue(newAgent.queue, responseTask),
          };
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
        
        // Add to pending map and initiate async LLM call
        newAgent = {
          ...newAgent,
          queue: QueueOps.enqueue(newAgent.queue, llmRequestTask),
          pendingMap: PendingOps.addPending(newAgent.pendingMap, {
            id: llmRequestTask.id,
            conversationId: llmRequestTask.conversationId,
            taskType: llmRequestTask.type,
            createdAt: llmRequestTask.createdAt,
            timeoutAt: new Date(Date.now() + 30000), // 30 second timeout
          }),
        };
        break;
      }
      
      case 'send_llm_request': {
        // Execute LLM request
        const { prompt, temperature } = task.payload as { prompt: string; temperature?: number };
        
        if (!newAgent.config.llmClient) {
          // Remove from pending
          newAgent = {
            ...newAgent,
            pendingMap: PendingOps.removePending(newAgent.pendingMap, task.id),
          };
          break;
        }
        
        const llmRequest: LLMRequest = { prompt, temperature };
        
        try {
          const response = await newAgent.config.llmClient.generateResponse(llmRequest);
          
          // Remove from pending map
          newAgent = {
            ...newAgent,
            pendingMap: PendingOps.removePending(newAgent.pendingMap, task.id),
          };
          
          // Create response task
          const responseTask: Task = {
            id: generateId(),
            conversationId: task.conversationId,
            type: 'return_response',
            payload: { response: response.content },
            createdAt: new Date(),
            onComplete: task.onComplete,
          };
          
          newAgent = {
            ...newAgent,
            queue: QueueOps.enqueue(newAgent.queue, responseTask),
          };
        } catch (error) {
          // Remove from pending on error
          newAgent = {
            ...newAgent,
            pendingMap: PendingOps.removePending(newAgent.pendingMap, task.id),
          };
          
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          const errorTask: Task = {
            id: generateId(),
            conversationId: task.conversationId,
            type: 'return_response',
            payload: { response: `[Error: ${errorMsg}]` },
            createdAt: new Date(),
            onComplete: task.onComplete,
          };
          
          newAgent = {
            ...newAgent,
            queue: QueueOps.enqueue(newAgent.queue, errorTask),
          };
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
    if (newAgent.config.autoSave) {
      await newAgent.config.storage.save({
        queue: newAgent.queue,
        pendingMap: newAgent.pendingMap,
      });
    }

  } catch (error) {
    console.error(`Error processing task ${task.id}:`, error);
  }

  return newAgent;
};

export const processAllTasks = async (agent: Agent): Promise<Agent> => {
  let currentAgent = agent;
  
  // Process all tasks currently in queue
  while (!QueueOps.isEmpty(currentAgent.queue)) {
    currentAgent = await processNextTask(currentAgent);
  }
  
  return currentAgent;
};

export const processMessageAndWait = async (
  agent: Agent,
  userId: UserId,
  message: string
): Promise<[string, Agent]> => {
  return new Promise((resolve) => {
    // Create message with completion callback
    const [, agentWithTask] = processMessage(agent, userId, message, (result) => {
      resolve([result as string, agentWithTask]);
    });
    
    // Process all tasks asynchronously
    processAllTasks(agentWithTask).then((finalAgent) => {
      // If callback wasn't called, resolve with error
      resolve(['[No response received]', finalAgent]);
    });
  });
};

export const getAgentStatus = (agent: Agent): {
  queueSize: number;
  pendingTasks: number;
} => ({
  queueSize: QueueOps.size(agent.queue),
  pendingTasks: PendingOps.size(agent.pendingMap),
});

