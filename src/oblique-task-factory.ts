// Oblique Task Factory Functions
// Orchestrates the flow: Notification → LLM → Bluesky Reply

import type { DrakidionTask, ConversationMessage } from './drakidion/drakidion-types.js';
import type { BlueskyMessage } from './types/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import type { BlueskyClient } from './hooks/bluesky/bluesky-client.js';
import { createObliquePrompt } from './prompts/oblique.js';
import { nextTask, createSucceededTask, newReadyTask, newWaitingTask } from './drakidion/task-factories.js';

/**
 * Step 1: Create a task to process a Bluesky notification
 * This is a READY task that creates a WAITING task for LLM response
 * Starts a new task chain (taskId generated, version 1)
 */
export const createProcessNotificationTask = (
  notification: BlueskyMessage,
  llmClient: LLMClient,
  blueskyClient: BlueskyClient,
  onTaskCreated: (task: DrakidionTask) => void,
  onWaitingTaskComplete?: (taskId: string, successorTask: DrakidionTask) => void
): DrakidionTask => {
  const description = `Notification from @${notification.author}`;

  const task: DrakidionTask = {
    // Starts new chain: fresh taskId, version 1
    ...newReadyTask(description),
    work: notification.text,
    process: async () => {
      // Create and queue the LLM task as successor (same taskId, version 2)
      const llmTask = createSendToLLMTask(
        notification,
        llmClient,
        blueskyClient,
        onTaskCreated,
        onWaitingTaskComplete,
        // Pass predecessor task for threading
        task
      );
      
      onTaskCreated(llmTask);

      // Return succeeded version of this task
      return createSucceededTask(task);
    },
  };

  return task;
};

/**
 * Succeeded version of LLM task
 */
const createSendToLLMSucceededTask = (
  task: DrakidionTask,
  responseContent: string
): DrakidionTask => {
  const finalConversation: ConversationMessage[] = [
    ...(task.conversation || []),
    { source: 'assistant', text: responseContent },
  ];

  return {
    ...createSucceededTask(task),
    work: responseContent,
    conversation: finalConversation,
  };
};

/**
 * Dead version of LLM task (on error)
 */
const createSendToLLMDeadTask = (
  task: DrakidionTask,
  error: any
): DrakidionTask => {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';

  return {
    ...nextTask(task),
    status: 'dead',
    work: `Error: ${errorMsg}`,
    conversation: task.conversation,
    doneAt: new Date(),
  };
};

/**
 * Step 2: Create a task to send message to LLM
 * This is a WAITING task that creates a READY task when response arrives
 * Successor task (inherits taskId from predecessor, version = predecessor.version + 1)
 */
export const createSendToLLMTask = (
  notification: BlueskyMessage,
  llmClient: LLMClient,
  blueskyClient: BlueskyClient,
  onTaskCreated: (task: DrakidionTask) => void,
  onWaitingTaskComplete: ((taskId: string, successorTask: DrakidionTask) => void) | undefined,
  predecessor: DrakidionTask
): DrakidionTask => {
  const description = `Oblique: ${notification.text.substring(0, 40)}${notification.text.length > 40 ? '...' : ''}`;
  
  const conversation: ConversationMessage[] = [
    { source: 'user', text: notification.text },
  ];

  // Generate Oblique prompt
  const prompt = createObliquePrompt(notification.text);

  // Create waiting task as successor (inherits taskId, increments version)
  const task: DrakidionTask = {
    ...nextTask(predecessor),
    status: 'waiting',
    description,
    work: 'Waiting for LLM response...',
    conversation,
  };

  // Initiate the LLM call immediately
  llmClient.generateResponse({
    prompt,
    temperature: 0.8,
  })
    .then(response => {
      // Create succeeded task
      const succeededTask = createSendToLLMSucceededTask(task, response.content);
      
      // Notify that waiting task is complete with successor
      if (onWaitingTaskComplete) {
        onWaitingTaskComplete(task.taskId, succeededTask);
      }
      
      // Create the post reply task when LLM responds as successor
      const postTask = createPostReplyTask(
        notification,
        response.content,
        blueskyClient,
        conversation,
        task // Pass predecessor task for threading
      );
      
      onTaskCreated(postTask);
    })
    .catch(error => {
      // Create dead task
      const deadTask = createSendToLLMDeadTask(task, error);
      
      // Notify that waiting task is complete with error successor
      if (onWaitingTaskComplete) {
        onWaitingTaskComplete(task.taskId, deadTask);
      }
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`LLM task ${task.taskId} failed:`, errorMsg);
    });

  return task;
};

/**
 * Succeeded version of post reply task
 */
const createPostReplySucceededTask = (
  task: DrakidionTask,
  resultUri: string
): DrakidionTask => {
  return {
    ...nextTask(task),
    status: 'succeeded',
    work: `Posted: ${task.work} (${resultUri})`,
    conversation: task.conversation,
    doneAt: new Date(),
  };
};

/**
 * Dead version of post reply task (on error)
 */
const createPostReplyDeadTask = (
  task: DrakidionTask,
  error: any
): DrakidionTask => {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';

  return {
    ...nextTask(task),
    status: 'dead',
    work: `Failed to post: ${errorMsg}`,
    conversation: task.conversation,
    doneAt: new Date(),
  };
};

/**
 * Step 3: Create a task to post reply to Bluesky
 * This is a READY task that posts the response and succeeds
 * Successor task (inherits taskId from predecessor, version = predecessor.version + 1)
 */
export const createPostReplyTask = (
  originalNotification: BlueskyMessage,
  replyText: string,
  blueskyClient: BlueskyClient,
  conversation: ConversationMessage[] | undefined,
  predecessor: DrakidionTask
): DrakidionTask => {
  const description = `Post reply to @${originalNotification.author}`;

  const task: DrakidionTask = {
    ...nextTask(predecessor),
    status: 'ready',
    description,
    work: replyText,
    conversation,
    process: async () => {
      try {
        // Determine root and parent for reply threading
        // If the notification has replyInfo, use its root (original post in thread)
        // Otherwise, use the notification itself as the root (starting a new thread)
        const root = originalNotification.replyInfo?.root || {
          uri: originalNotification.uri,
          cid: originalNotification.cid,
        };
        
        const parent = {
          uri: originalNotification.uri,
          cid: originalNotification.cid,
        };

        // Post the reply to Bluesky
        const result = await blueskyClient.post({
          text: replyText,
          replyTo: {
            root,
            parent,
          },
        });

        // Return succeeded version
        return createPostReplySucceededTask(task, result.uri);
      } catch (error) {
        // Return dead version on error
        return createPostReplyDeadTask(task, error);
      }
    },
  };

  return task;
};

/**
 * Succeeded version of Oblique message task
 */
const createObliqueMessageSucceededTask = (
  task: DrakidionTask,
  responseContent: string
): DrakidionTask => {
  const finalConversation: ConversationMessage[] = [
    ...(task.conversation || []),
    { source: 'assistant', text: responseContent },
  ];

  return {
    ...nextTask(task),
    status: 'succeeded',
    work: responseContent,
    conversation: finalConversation,
    doneAt: new Date(),
  };
};

/**
 * Dead version of Oblique message task (on error)
 */
const createObliqueMessageDeadTask = (
  task: DrakidionTask,
  error: any
): DrakidionTask => {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';

  return {
    ...nextTask(task),
    status: 'dead',
    work: `Error: ${errorMsg}`,
    conversation: task.conversation,
    doneAt: new Date(),
  };
};

/**
 * Create a task that processes an Oblique message with an LLM
 * This applies the Oblique prompt transformation before calling the LLM.
 * This creates a waiting task and initiates the LLM call immediately.
 * The onComplete callback is called when the LLM responds (success or error).
 * 
 * This is a standalone task chain (starts with fresh taskId, version 1)
 */
export const createObliqueMessageTask = (
  message: string,
  llmClient: LLMClient,
  createPrompt: (message: string) => string,
  onComplete: (taskId: string, successorTask: DrakidionTask) => void,
  options?: {
    temperature?: number;
    conversation?: ConversationMessage[];
  }
): DrakidionTask => {
  const description = `Oblique: ${message.substring(0, 40)}${message.length > 40 ? '...' : ''}`;
  
  // Add user message to conversation
  const conversation = options?.conversation || [];
  const updatedConversation: ConversationMessage[] = [
    ...conversation,
    { source: 'user', text: message },
  ];
  
  // Generate Oblique prompt
  const prompt = createPrompt(message);
  
  // Create waiting task (starts new chain)
  const task: DrakidionTask = {
    ...newWaitingTask(description),
    work: 'Waiting for LLM response...',
    conversation: updatedConversation,
  };
  
  // Initiate the LLM call immediately
  llmClient.generateResponse({
    prompt,
    temperature: options?.temperature ?? 0.8,
  })
    .then(response => {
      // Create succeeded task
      const succeededTask = createObliqueMessageSucceededTask(task, response.content);
      
      // Call onComplete with successor task
      onComplete(task.taskId, succeededTask);
    })
    .catch(error => {
      // Create dead task
      const deadTask = createObliqueMessageDeadTask(task, error);
      
      // Call onComplete with error successor task
      onComplete(task.taskId, deadTask);
    });
  
  return task;
};
