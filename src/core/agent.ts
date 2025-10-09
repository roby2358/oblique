// Core agent orchestrator
import type { Task, TaskId, UserAction, UserId, LLMRequest } from '../types/index.js';
import type { Queue } from './queue.js';
import type { PendingMap } from './pending-map.js';
import type { UserStackMap } from './user-stack-map.js';
import type { Storage } from '../storage/storage-interface.js';
import type { LLMClient } from '../hooks/llm/llm-client.js';
import type { BlueskyClient } from '../hooks/bluesky/bluesky-client.js';

import * as QueueOps from './queue.js';
import * as PendingOps from './pending-map.js';
import * as UserStackOps from './user-stack-map.js';
import { generateId } from '../utils/index.js';
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
  userStackMap: UserStackMap;
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
    userStackMap: UserStackOps.createUserStackMap(),
    config,
  };
};

export const processMessage = async (
  agent: Agent,
  userId: UserId,
  message: string
): Promise<[string, Agent]> => {
  // Track user action
  const action: UserAction = {
    actionId: generateId(),
    userId,
    action: 'send_message',
    timestamp: new Date(),
    metadata: { message },
  };
  
  let newAgent = {
    ...agent,
    userStackMap: UserStackOps.pushAction(agent.userStackMap, userId, action),
  };

  // Get recent context from user's action stack
  const recentActions = UserStackOps.getStack(newAgent.userStackMap, userId)
    .slice(-3)
    .map(a => a.metadata?.message)
    .filter(Boolean)
    .join('\n');

  // Generate oblique response
  if (!newAgent.config.llmClient) {
    return ['[LLM not configured]', newAgent];
  }

  const prompt = createObliquePrompt(message, recentActions);
  const llmRequest: LLMRequest = {
    prompt,
    temperature: 0.8,
  };

  try {
    const response = await newAgent.config.llmClient.generateResponse(llmRequest);
    
    // Save state if auto-save is enabled
    if (newAgent.config.autoSave) {
      await newAgent.config.storage.save({
        queue: newAgent.queue,
        pendingMap: newAgent.pendingMap,
        userStackMap: newAgent.userStackMap,
      });
    }

    return [response.content, newAgent];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return [`[Error: ${errorMsg}]`, newAgent];
  }
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

  // Add to pending map
  newAgent = {
    ...newAgent,
    pendingMap: PendingOps.addPending(newAgent.pendingMap, {
      id: task.id,
      taskType: task.type,
      createdAt: task.createdAt,
      timeoutAt: new Date(Date.now() + 30000), // 30 second timeout
    }),
  };

  try {
    // Process task based on type
    switch (task.type) {
      case 'send_bluesky_post':
        // Handle Bluesky posting
        break;
      case 'send_llm_request':
        // Handle LLM request
        break;
      default:
        break;
    }

    // Remove from pending
    newAgent = {
      ...newAgent,
      pendingMap: PendingOps.removePending(newAgent.pendingMap, task.id),
    };

  } catch (error) {
    console.error(`Error processing task ${task.id}:`, error);
  }

  return newAgent;
};

export const getAgentStatus = (agent: Agent): {
  queueSize: number;
  pendingTasks: number;
  activeUsers: number;
} => ({
  queueSize: QueueOps.size(agent.queue),
  pendingTasks: PendingOps.size(agent.pendingMap),
  activeUsers: UserStackOps.getAllUserIds(agent.userStackMap).length,
});

