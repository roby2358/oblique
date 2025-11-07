// Bluesky Polling Module - Handles notification response logic
import type { BlueskyMessage } from './types/index.js';
import type { BlueskyHistoryEntry } from './hooks/bluesky/bluesky-client.js';
import { getConfig } from './config.js';

/**
 * Normalize a Bluesky handle by removing any leading @ symbol
 * @param handle - The handle to normalize (may be undefined, null, or empty)
 * @returns The normalized handle without leading @
 */
const normalizeHandle = (handle: string | undefined | null): string => {
  return (handle || '').replace(/^@/, '');
};

/** Check if a single notification should be responded to based on response rules
 * 
 * This is the first, quick check to see if the notification should be responded to.
 * @param notification - The notification to check
 * @param postData - The post thread data from getSinglePost
 * @returns Whether the notification should be responded to
 */
export const shouldRespondToNotification = (
  notification: BlueskyMessage,
  postData: any
): boolean => {
  // Rule 1: Check if author is in ignore list
  const config = getConfig();
  const configuredHandle: string = normalizeHandle(config.bluesky.handle);

  if (config.ignoreList.includes(notification.author)) {
    console.log(`Skipping @${notification.author}: Author is in ignore list`);
    return false;
  }

  // Rule 2: Don't reply to quote posts unless the handle is in the text
  if (
    notification.reason === 'quote' &&
    configuredHandle &&
    !notification.text.includes(configuredHandle)
  ) {
    console.log(`Skipping @${notification.author}: This is a quote post`);
    return false;
  }

  // Rule 3: If it's a direct mention, we MUST reply regardless of existing replies
  if (notification.reason === 'mention') {
    console.log(`  ✓ Direct mention detected - will respond to @${notification.author}`);
    return true;
  }

  // If we can't parse the post data, skip response
  // Likely it was deleted
  const thread = postData?.data?.thread as any;
  if (!thread ||
    thread.$type !== 'app.bsky.feed.defs#threadViewPost') {
    console.log(`Skipping @${notification.author}: Post data is invalid (deleted?)`);
    return false;
  }
  
  // Rule 4: If it's not a direct mention, check if anyone has already replied
  const hasReplies = !!(thread.replies && thread.replies.length > 0);
  
  if (hasReplies) {
    console.log(`Skipping @${notification.author}: Someone already replied to this post`);
    return false;
  }

  return true;
};

/**
 * Check if we should skip a thread based on bot activity in recent messages
 * Only applies bot count filtering if the last author is a bot
 * @param thread - The full thread history
 * @returns true if we should skip the thread, false if we should continue
 */
const skipForBotAttenuation = (thread: BlueskyHistoryEntry[]): boolean => {
  const config = getConfig();
  const botList = config.botList;
  // Check the last 8 authors in the thread
  const lastEightMessages = thread.slice(-8);
  const lastEightAuthors = lastEightMessages.map(entry => normalizeHandle(entry.author));
  const lastAuthor = lastEightAuthors[lastEightAuthors.length - 1];
  const isLastAuthorBot = botList.includes(lastAuthor);

  console.log(`All bots: ${botList.join('|')}`);
  console.log(`Last 8 authors: ${lastEightAuthors.join('|')}`);
  console.log(`Last message author: ${lastAuthor} bot? ${isLastAuthorBot}`);

  // Only check bot count if the last author is a bot
  if (isLastAuthorBot) {
    const messagesFromLastAuthor = lastEightAuthors.filter(author => author === lastAuthor).length;
    console.log(`Messages from last author (${lastAuthor}) in last 8: ${messagesFromLastAuthor}`);

    if (messagesFromLastAuthor >= 4) {
      console.log(`Skipping thread: Last author ${lastAuthor} has ${messagesFromLastAuthor} messages in last 8 (>= 4 limit)`);
      return true;
    }
  }

  return false;
};

/**
 * This is the second check against the whole thread to see if we should respond.
 * This examines the full conversation context to make more sophisticated decisions.
 * @param thread - The full thread history
 * @returns The thread if we should respond, null if we should not
 */
export const shouldRespondToThread = (thread: BlueskyHistoryEntry[]): BlueskyHistoryEntry[] | null => {
  // If thread is empty, don't respond
  if (!thread || thread.length === 0) {
    return null;
  }

  // Check if we should skip due to bot activity
  if (skipForBotAttenuation(thread)) {
    console.log(`Skipping thread: Bot attenuation`);
    return null;
  }

  // Check if the thread is too long (avoid very long conversations)
  if (thread.length > 60) {
    console.log(`Skipping thread: Thread is too long (${thread.length} messages)`);
    return null;
  }
  
  // For now, if we get this far, we should respond
  console.log(`✓ Thread passed thread-level checks (${thread.length} messages)`);
  return thread;
};

