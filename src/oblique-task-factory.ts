// Oblique Task Factory Functions
// Orchestrates the flow: Notification → LLM → Bluesky Reply

import type { DrakidionTask, ConversationMessage } from './drakidion/drakidion-types.js';
import type { BlueskyMessage } from './types/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import type { BlueskyClient } from './hooks/bluesky/bluesky-client.js';
import { createObliqueConversation, getDailyModel, getDailyGender } from './prompts/oblique.js';
import { nextTask, createSucceededTask, createDeadTask, newReadyTask, newWaitingTask } from './drakidion/task-factories.js';
import { shouldRespondToThread } from './bluesky-polling.js';

// Single source of truth for reply length limits
const MAX_BLUESKY_REPLY_CHARS = 299;
// Punctuation considered safe boundaries for truncation (omit when cutting)
const OBLIQUE_TRUNCATION_PUNCTUATION = new Set(['.', '!', '?', ',', ':', ';', '—', '–', '…', '(', '\n']);
// Regex to extract content after "# Response" header
const RESPONSE_HEADER_REGEX = /# Response\s*\n?(.*)/s;

/**
 * Intelligently truncate text by finding the last punctuation mark
 * If no punctuation found, truncate to MAX_OBLIQUE_REPLY_CHARS
 * Omits the final punctuation when truncating
 */
const truncateAtLastPunctuation = (text: string): string => {
  if (text.length <= MAX_BLUESKY_REPLY_CHARS) {
    return text;
  }

  // Extended punctuation marks set and backward scan within limit
  const limit = Math.min(MAX_BLUESKY_REPLY_CHARS - 1, text.length - 1);
  for (let i = limit; i >= 0; i--) {
    const ch = text[i];
    if (OBLIQUE_TRUNCATION_PUNCTUATION.has(ch)) {
      if (i < 1) {
        break;
      }
      return text.substring(0, i);
    }
  }
  
  // If no punctuation found, just truncate to maxLength
  return text.substring(0, MAX_BLUESKY_REPLY_CHARS);
};

/**
 * Extract and trim text after "# Response" header from LLM response
 */
const extractResponseContent = (content: string): string | null => {
  const match = content.match(RESPONSE_HEADER_REGEX);
  
  if (!match) {
    // If no "# Response" header found, return null
    return null;
  }
  
  // Extract and trim the captured content, removing backticks
  return match[1].trim().replace(/^`+|`+$/g, '');
};

/**
 * Generate LLM response with retry logic for length constraints
 * Retries up to 5 times if response is longer than 300 characters
 * Returns null if conversation is null (aborted)
 */
const generateLLMResponseWithRetry = async (
  llmClient: LLMClient,
  conversation: ConversationMessage[] | null,
  maxAttempts: number = 5
): Promise<{ conversation: ConversationMessage[]; response: { content: string } } | null> => {
  // If conversation is null (aborted), return null
  if (!conversation) {
    return null;
  }
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const response = await llmClient.generateResponse({
      conversation,
      temperature: 0.8,
      maxTokens: 2000,
    });
    
    console.log('LLM response:', response.content);
    
    // If no response section found, use original content
    const contentToUse = extractResponseContent(response.content) || response.content;
    
    // Check if response is within character limit
    if (contentToUse.length < 300) {
      return { conversation, response: { ...response, content: contentToUse } };
    }
    
    console.log(`Attempt ${attempts}: Response too long (${response.content.length} chars), retrying...`);
    
    // If this is the last attempt, intelligently truncate the response
    if (attempts >= maxAttempts) {
      const truncatedContent = truncateAtLastPunctuation(contentToUse);
      console.log(`Max attempts reached, intelligently truncating: "${truncatedContent}"`);
      return { 
        conversation, 
        response: { ...response, content: truncatedContent }
      };
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw new Error('Unexpected error in retry logic');
};

/**
 * Step 1: Create a task to process a Bluesky notification
 * This is a READY task that creates a WAITING task for LLM response
 * Starts a new task chain (taskId generated, version 1)
 */
export const createReplyTask = (
  notification: BlueskyMessage,
  llmClient: LLMClient,
  blueskyClient: BlueskyClient,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void
): DrakidionTask => {
  const description = `Notification from @${notification.author}`;

  const task: DrakidionTask = {
    // This is where we need to build the conversation
    conversation: [{ role: 'user', content: notification.text }],

    // Starts new chain: fresh taskId, version 1
    ...newReadyTask(description),
    work: "<thinking>",
    process: () => {
      // When we process this task, we create a new SendToLLMTask (waiting task)
      return createSendToLLMTask(
        notification,
        llmClient,
        blueskyClient,
        onWaitingTaskComplete,
        nextTask(task)
      );
    },
  };

  return task;
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
 * Send reply from LLM result
 * Handles null result case (aborted due to thread checks)
 */
const sendReply = (
  result: { conversation: ConversationMessage[]; response: { content: string } } | null,
  notification: BlueskyMessage,
  blueskyClient: BlueskyClient,
  task: DrakidionTask,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void
): void => {
  if (!result) {
    console.log('Task creation aborted due to thread-level checks');
    return;
  }
  
  const { conversation, response } = result;
  console.log('LLM response:', response.content);

  const postTask = createPostReplyTask(
    notification,
    response.content,
    blueskyClient,
    conversation,
    nextTask(task) // Pass the base task properties
  );
  
  // Notify that waiting task is complete with the actual successor
  onWaitingTaskComplete(task.taskId, postTask);
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
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void,
  baseTask: Partial<DrakidionTask>
): DrakidionTask => {
  const description = `Oblique: ${notification.text.substring(0, 40)}${notification.text.length > 40 ? '...' : ''}`;
  
  // Create waiting task as successor (inherits taskId, increments version)
  const task: DrakidionTask = {
    ...baseTask,
    status: 'waiting',
    description,
    work: 'Waiting for LLM response...',
    conversation: baseTask.conversation || [],
  } as DrakidionTask;
  
  // Get the unified message history
  const getHistoryPromise = blueskyClient.getHistory(notification);

  console.log('Model: ', getDailyModel(), ' Gender: ', getDailyGender());
  
  // Fetch the thread history and create conversation with thread-level checks
  getHistoryPromise
    .then(thread => shouldRespondToThread(thread))
    .then(thread => createObliqueConversation(thread))
    .then(conversation => generateLLMResponseWithRetry(llmClient, conversation))
    .then(result => sendReply(result, notification, blueskyClient, task, onWaitingTaskComplete))
    .catch(error => {
      // Create dead task
      const deadTask = createSendToLLMDeadTask(task, error);
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`LLM task ${task.taskId} failed:`, errorMsg);
      
      onWaitingTaskComplete(task.taskId, deadTask);
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
  baseTask: Partial<DrakidionTask>
): DrakidionTask => {
  const description = `Post reply to @${originalNotification.author}`;

  const task: DrakidionTask = {
    ...baseTask,
    description,
    work: replyText,
    conversation,
    process: () => {
      try {
        // Get reply threading info for the notification
        const replyTo = blueskyClient.notificationReplyTo(originalNotification);

        // Like the original post first
        console.log(`Liking post ${originalNotification.uri} before replying...`);
        blueskyClient.like(originalNotification.uri);

        // Post the reply to Bluesky
        blueskyClient.post({
          text: replyText,
          replyTo,
        });

        // Return succeeded version (TODO: handle async result properly)
        return createPostReplySucceededTask(task, 'reply-posted');
      } catch (error) {
        // Return dead version on error
        return createPostReplyDeadTask(task, error);
      }
    },
  } as DrakidionTask;

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
  
  const model = getDailyModel();
  
  // Initiate the LLM call immediately
  llmClient.generateResponse({
    conversation: messages,
    model: model,
    temperature: options?.temperature ?? 0.8,
    maxTokens: 2000,
  })
    .then(response => {
      console.log('LLM response:', response.content);

      // Apply truncation logic to ensure response is within character limit
      let content = extractResponseContent(response.content) || 'error extracting response content';
      
      // Create succeeded task and call onComplete with successor task
      const succeededTask = createObliqueMessageSucceededTask(task, content);
      onComplete(task.taskId, succeededTask);
    })
    .catch(error => {
      // Create dead task and call onComplete with error successor task
      const deadTask = createObliqueMessageDeadTask(task, error);
      onComplete(task.taskId, deadTask);
    });
  
  return task;
};
