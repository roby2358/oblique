// Oblique Task Factory Functions
// Orchestrates the flow: Notification → LLM → Bluesky Reply

import type { DrakidionTask, ConversationMessage } from './drakidion/drakidion-types.js';
import type { BlueskyMessage } from './types/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import type { BlueskyClient } from './hooks/bluesky/bluesky-client.js';
import { systemPrompt, obliquePrompt } from './prompts/oblique.js';
import { nextTask, createSucceededTask, createDeadTask, newReadyTask, newWaitingTask } from './drakidion/task-factories.js';

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
    // This is where we need to build the conversation
    conversation: [{ role: 'user', content: notification.text }],

    // Starts new chain: fresh taskId, version 1
    ...newReadyTask(description),
    work: "<thinking>",
    process: async () => {
      // Create and return the LLM task as successor (same taskId, version 2)
      return createSendToLLMTask(
        notification,
        llmClient,
        blueskyClient,
        onTaskCreated,
        onWaitingTaskComplete,
        // Pass predecessor task for threading
        task
      );
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
    { role: 'assistant', content: responseContent },
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
    ...createDeadTask(task),
    work: `Error: ${errorMsg}`,
    conversation: task.conversation,
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
  
  // Create waiting task as successor (inherits taskId, increments version)
  const task: DrakidionTask = {
    ...nextTask(predecessor),
    status: 'waiting',
    description,
    work: 'Waiting for LLM response...',
    conversation: predecessor.conversation,
  };
  
  const conversation: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: obliquePrompt(notification.text) },
  ];

  // Initiate the LLM call immediately
  llmClient.generateResponse({
    conversation,
    temperature: 0.8,
    maxTokens: 3000,
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
    ...createSucceededTask(task),
    work: `Posted: ${task.work} (${resultUri})`,
    conversation: task.conversation,
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
    ...createDeadTask(task),
    work: `Failed to post: ${errorMsg}`,
    conversation: task.conversation,
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
    description,
    work: replyText,
    conversation,
    process: async () => {
      try {
        // Get reply threading info for the notification
        const replyTo = blueskyClient.notificationReplyTo(originalNotification);

        // Post the reply to Bluesky
        const result = await blueskyClient.post({
          text: replyText,
          replyTo,
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
    { role: 'assistant', content: responseContent },
  ];

  return {
    ...createSucceededTask(task),
    work: responseContent,
    conversation: finalConversation,
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
    ...createDeadTask(task),
    work: `Error: ${errorMsg}`,
    conversation: task.conversation,
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
  llmClient: LLMClient,
  messages: { role: string; content: string }[],
  onComplete: (taskId: string, successorTask: DrakidionTask) => void,
  options?: {
    temperature?: number;
  }
): DrakidionTask => {
  const task: DrakidionTask = {
    ...newWaitingTask("Oblique message"),
    work: 'Waiting for LLM response...',
    conversation: messages,
  };
  
  // Initiate the LLM call immediately
  llmClient.generateResponse({
    conversation: messages,
    temperature: options?.temperature ?? 0.8,
    maxTokens: 1000,
  })
    .then(response => {
      // Create succeeded task and call onComplete with successor task
      const succeededTask = createObliqueMessageSucceededTask(task, response.content);
      onComplete(task.taskId, succeededTask);
    })
    .catch(error => {
      // Create dead task and call onComplete with error successor task
      const deadTask = createObliqueMessageDeadTask(task, error);
      onComplete(task.taskId, deadTask);
    });
  
  return task;
};
