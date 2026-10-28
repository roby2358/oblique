// Oblique Task Factory Functions
// Orchestrates the flow: Notification → LLM → Bluesky Reply

import type { DrakidionTask, ConversationMessage } from './drakidion/drakidion-types.js';
import type { BlueskyMessage } from './types/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import type { BlueskyClient } from './hooks/bluesky/bluesky-client.js';
import { createObliqueConversation, formatThread, getDailyModel, getDailyGender } from './prompts/oblique.js';
import { chooseRegister } from './register-choice.js';
import type { JevClient } from './hooks/jev/jev-client.js';
import { nextTask, createSucceededTask, createCanceledTask, createDeadTask, newReadyTask, newWaitingTask } from './drakidion/task-factories.js';
import { threadRestraintReason } from './bluesky-polling.js';
import { MAX_BLUESKY_REPLY_CHARS } from './reply-length.js';

// Punctuation considered safe boundaries for truncation (omit when cutting)
const OBLIQUE_TRUNCATION_PUNCTUATION = new Set(['.', '!', '?', ',', ':', ';', '—', '–', '…', '(', '\n']);
// Regex to extract content after "# Response" header
const RESPONSE_HEADER_REGEX = /# Response\s*\n?(.*)/s;

const FALLBACK_NOTIFICATION_TEXT = '(no text provided)';

const coalesceText = (text: unknown, fallback: string): string => {
  if (typeof text === 'string' && text.length > 0) {
    return text;
  }
  return fallback;
};

/**
 * Intelligently truncate text by finding the last punctuation mark
 * If no punctuation found, truncate to MAX_BLUESKY_REPLY_CHARS
 * Omits the final punctuation when truncating
 */
export const truncateAtLastPunctuation = (text: string): string => {
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
  
  // If no punctuation found, just truncate to the limit
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
 * Retries while the response is longer than MAX_BLUESKY_REPLY_CHARS
 */
const generateLLMResponseWithRetry = async (
  llmClient: LLMClient,
  conversation: ConversationMessage[],
  maxAttempts: number = 5
): Promise<{ conversation: ConversationMessage[]; response: { content: string } }> => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const response = await llmClient.generateResponse({
      conversation,
      model: getDailyModel(),
      temperature: 0.8,
      maxTokens: 8000,
    });
    
    console.log('LLM response:', response.content);
    
    // If no response section found, use original content
    const contentToUse = extractResponseContent(response.content) || response.content;
    
    // Check if response is within character limit
    if (contentToUse.length <= MAX_BLUESKY_REPLY_CHARS) {
      return { conversation, response: { ...response, content: contentToUse } };
    }
    
    console.log(`Attempt ${attempts}: Response too long (${contentToUse.length} chars, limit ${MAX_BLUESKY_REPLY_CHARS}), retrying...`);
    
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
 * Acknowledge a post, whatever else happens to it.
 *
 * Dispatched and not awaited, on both the paths that use it: the like is never the thing the
 * chain is waiting for. A rejected like is logged and goes no further — a reply still lands,
 * and a silence is still a silence. There is nothing to recover: the post has moved down the
 * firehose by the time anyone could try again (D-13, D-27).
 */
const likeQuietly = (blueskyClient: BlueskyClient, postUri: string): void => {
  blueskyClient.like(postUri).catch(error => {
    console.warn(`Failed to like ${postUri}:`, error);
  });
};

/**
 * Terminal version of a chain a restraint rule declined.
 *
 * Not a failure and not a success: nothing was asked of the LLM and nothing was posted, so
 * the chain ends `canceled` with the reason as its last work line. Ending it is the point —
 * a declined chain that never completes sits in the WaitingSet for the life of the tab and
 * makes the waiting count lie exactly when restraint is working (D-24).
 */
const createDeclinedTask = (
  task: DrakidionTask,
  reason: string
): DrakidionTask => {
  return {
    ...createCanceledTask(task),
    work: [...task.work, `Declined: ${reason}`],
    conversation: task.conversation,
  };
};

/**
 * Terminal version of a chain that chose silence.
 *
 * `canceled` like a declined chain, because nothing was posted and nothing failed — but it is
 * a different ending and says so, since a declined chain was never Oblique's choice and this
 * one was. The like is the whole of the answer (D-27).
 */
const createSilencedTask = (
  task: DrakidionTask,
  author: string
): DrakidionTask => {
  return {
    ...createCanceledTask(task),
    work: [...task.work, `Silence: liked @${author} and left it`],
    conversation: task.conversation,
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
    work: [...task.work, `Error: ${errorMsg}`],
    conversation: task.conversation,
  };
};

/**
 * Step 1: Create a task to process a Bluesky notification
 * This is a READY task that creates a WAITING task for LLM response
 * Starts a new task chain (taskId generated, version 1)
 */
export const createReplyTask = (
  notification: BlueskyMessage,
  llmClient: LLMClient,
  jevClient: JevClient | undefined,
  blueskyClient: BlueskyClient,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void
): DrakidionTask => {
  const description = `Notification from @${notification.author}`;
  const notificationText = coalesceText(notification?.text, FALLBACK_NOTIFICATION_TEXT);

  const task: DrakidionTask = {
    // Starts new chain: fresh taskId, version 1. Spread first, so the fields
    // below override the factory's defaults rather than being overwritten by them.
    ...newReadyTask(description),

    // The notification is the first thing said in the chain's conversation
    conversation: [{ role: 'user', content: notificationText }],
    work: ["<thinking>"],
    process: () => {
      // When we process this task, we create a new SendToLLMTask (waiting task)
      return createSendToLLMTask(
        notification,
        llmClient,
        jevClient,
        blueskyClient,
        onWaitingTaskComplete,
        nextTask(task)
      );
    },
  };

  return task;
};

/**
 * Send reply from LLM result
 */
const sendReply = (
  result: { conversation: ConversationMessage[]; response: { content: string } },
  notification: BlueskyMessage,
  blueskyClient: BlueskyClient,
  task: DrakidionTask,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void
): void => {
  const { conversation, response } = result;
  console.log('LLM response:', response.content);

  const postTask = createPostReplyTask(
    notification,
    response.content,
    blueskyClient,
    conversation,
    onWaitingTaskComplete,
    nextTask(task) // Pass the base task properties
  );
  
  // Notify that waiting task is complete with the actual successor
  onWaitingTaskComplete(task.taskId, postTask);
};

/**
 * Fetch the thread, ask the second gate, ask the third, and either decline, answer or go quiet.
 *
 * Each gate's answer is acted on where it is given: a declined chain ends here, terminal, and
 * never reaches the LLM. Carrying the refusal onward as a `null` through the conversation
 * builder, the LLM call and the post would be the same decision re-checked three times, and
 * the last of those checks used to drop the chain without ending it (D-24).
 *
 * The register is chosen after the restraint gates and before the conversation is built: a
 * thread that is not going to be answered should cost no decision, and the decision has to be
 * in hand before there is a prompt to put it in. The gate it belongs to is a different kind
 * from the two above it — they ask whether to answer, it asks how — so its answer appends a
 * work line rather than ending the chain, except for silence, which is the one register with
 * nothing to write (D-27).
 */
const runReplyChain = async (
  notification: BlueskyMessage,
  llmClient: LLMClient,
  jevClient: JevClient | undefined,
  blueskyClient: BlueskyClient,
  task: DrakidionTask,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void
): Promise<void> => {
  const thread = await blueskyClient.getHistory(notification);
  const declined = threadRestraintReason(thread, notification.reason);

  if (declined) {
    console.log(`Declining the reply to @${notification.author}: ${declined}`);
    onWaitingTaskComplete(task.taskId, createDeclinedTask(task, declined));
    return;
  }

  const formatted = formatThread(thread);

  if (!formatted) {
    onWaitingTaskComplete(task.taskId, createDeclinedTask(task, 'the thread made no conversation'));
    return;
  }

  const { register, note } = await chooseRegister(
    jevClient,
    formatted.threadHistory,
    formatted.userMessage,
    Math.random
  );

  console.log(`Answering @${notification.author} in ${register.key}: ${note}`);

  // The same snapshot, carrying one more line. Successors inherit `work`, so the register
  // reaches every later version of the chain and the observer panel says why a reply reads
  // the way it does (D-25).
  const registered: DrakidionTask = {
    ...task,
    work: [...task.work, `Register: ${register.key} — ${note}`],
  };

  if (!register.postable) {
    likeQuietly(blueskyClient, notification.uri);
    onWaitingTaskComplete(registered.taskId, createSilencedTask(registered, notification.author));
    return;
  }

  const conversation = createObliqueConversation(thread, register);

  // Unreachable: the same thread already formatted above. Answered rather than asserted away,
  // because the builder is allowed to refuse a thread and a crash here would cost the chain.
  if (!conversation) {
    onWaitingTaskComplete(registered.taskId, createDeclinedTask(registered, 'the thread made no conversation'));
    return;
  }

  const result = await generateLLMResponseWithRetry(llmClient, conversation);

  sendReply(result, notification, blueskyClient, registered, onWaitingTaskComplete);
};

/**
 * Step 2: Create a task to send message to LLM
 * This is a WAITING task that creates a READY task when response arrives
 * Successor task (inherits taskId from predecessor, version = predecessor.version + 1)
 */
export const createSendToLLMTask = (
  notification: BlueskyMessage,
  llmClient: LLMClient,
  jevClient: JevClient | undefined,
  blueskyClient: BlueskyClient,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void,
  baseTask: Omit<DrakidionTask, 'doneAt'>
): DrakidionTask => {
  const notificationText = coalesceText(notification?.text, FALLBACK_NOTIFICATION_TEXT);
  const description = `Oblique: ${notificationText.substring(0, 40)}${notificationText.length > 40 ? '...' : ''}`;
  
  // Create waiting task as successor (inherits taskId, increments version)
  const task: DrakidionTask = {
    ...baseTask,
    status: 'waiting',
    description,
    work: [...baseTask.work, 'Waiting for LLM response...'],
    conversation: baseTask.conversation || [],
  };
  
  console.log('Model: ', getDailyModel(), ' Gender: ', getDailyGender());

  runReplyChain(notification, llmClient, jevClient, blueskyClient, task, onWaitingTaskComplete)
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
    work: [...task.work, `Posted: ${resultUri}`],
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
    work: [...task.work, `Failed to post: ${errorMsg}`],
    conversation: task.conversation,
  };
};

/**
 * Waiting version of post reply task: the post is in flight
 * Carries the chain's lines along; the reply text is the last of them
 */
const createPostReplyWaitingTask = (
  task: DrakidionTask
): DrakidionTask => {
  return {
    ...nextTask(task),
    status: 'waiting',
    conversation: task.conversation,
  };
};

/**
 * Step 3: Create a task to post reply to Bluesky
 * This is a READY task that dispatches the post and waits for Bluesky to confirm it
 * Successor task (inherits taskId from predecessor, version = predecessor.version + 1)
 */
export const createPostReplyTask = (
  originalNotification: BlueskyMessage,
  replyText: string,
  blueskyClient: BlueskyClient,
  conversation: ConversationMessage[] | undefined,
  onWaitingTaskComplete: (taskId: string, successorTask: DrakidionTask) => void,
  baseTask: Omit<DrakidionTask, 'doneAt'>
): DrakidionTask => {
  const description = `Post reply to @${originalNotification.author}`;

  const task: DrakidionTask = {
    ...baseTask,
    description,
    work: [...baseTask.work, replyText],
    conversation,
    process: () => {
      // An empty reply is never worth posting, and Bluesky accepts it silently
      if (replyText.trim().length === 0) {
        return createPostReplyDeadTask(task, new Error('Refusing to post an empty reply'));
      }

      try {
        // Get reply threading info for the notification
        const replyTo = blueskyClient.notificationReplyTo(originalNotification);

        // Like the original post first
        console.log(`Liking post ${originalNotification.uri} before replying...`);
        likeQuietly(blueskyClient, originalNotification.uri);

        // Post the reply to Bluesky. The chain waits for Bluesky to confirm it rather
        // than reporting success on dispatch (D-16).
        const waitingTask = createPostReplyWaitingTask(task);

        blueskyClient.post({
          text: replyText,
          replyTo,
        })
          .then(result => {
            onWaitingTaskComplete(
              waitingTask.taskId,
              createPostReplySucceededTask(waitingTask, result.uri)
            );
          })
          .catch(error => {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Post task ${waitingTask.taskId} failed:`, errorMsg);

            onWaitingTaskComplete(
              waitingTask.taskId,
              createPostReplyDeadTask(waitingTask, error)
            );
          });

        return waitingTask;
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
    work: [...task.work, responseContent],
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
    work: [...task.work, `Error: ${errorMsg}`],
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
    work: ['Waiting for LLM response...'],
    conversation: messages,
  };
  
  const model = getDailyModel();
  
  // Initiate the LLM call immediately
  llmClient.generateResponse({
    conversation: messages,
    model: model,
    temperature: options?.temperature ?? 0.8,
    maxTokens: 8000,
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
