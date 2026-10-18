// Bluesky Polling Module - Handles notification response logic
import type { BlueskyMessage } from './types/index.js';
import type { BlueskyHistoryEntry } from './hooks/bluesky/bluesky-client.js';
import { getConfig } from './config.js';
import { normalizeHandle } from './bluesky-accounts.js';

/**
 * The notification reasons that name a post. A like, repost or follow notification's `uri` is
 * the like/repost/follow record itself, so asking Bluesky for its thread is a 400 — and there
 * is nothing there to answer in any case.
 */
const REPLIABLE_REASONS = ['mention', 'reply', 'quote'];

/** Check whether a notification names a post at all
 *
 * Cheap and offline, so the caller can ask before fetching anything.
 * @param notification - The notification to check
 * @returns Whether `notification.uri` is a post Oblique could answer
 */
export const isRepliableNotification = (notification: BlueskyMessage): boolean => {
  return REPLIABLE_REASONS.includes(notification.reason);
};

/**
 * Why the post a notification names could not be read, or `null` when it could. `getPostThread`
 * answers a union and the poller folds a failed fetch into it, so four quite different
 * situations arrive in the same shape: the post is gone, the post is there but behind a block,
 * the fetch never returned, or the thread is a kind nothing here handles. Only the first is a
 * deleted post, so each is named rather than guessed at.
 *
 * Keyed by the fragment of the `$type` rather than the whole of it. Each network namespaces
 * its own copy of the union — `app.bsky.feed.defs#blockedPost`, `town.delve.feed.defs#blockedPost`
 * — and only the part after the `#` is common to all of them (D-23).
 */
const UNREADABLE_THREAD_TYPES: { [key: string]: string } = {
  notFoundPost: 'the post is gone',
  blockedPost: 'the post is blocked, by us or by its author',
};

export const threadKind = (thread: any): string => {
  if (typeof thread?.$type !== 'string') {
    return '';
  }

  const [, fragment] = thread.$type.split('#');

  if (!fragment) {
    return '';
  }

  return fragment;
};

export const postUnreadableReason = (postData: any): string | null => {
  const thread = postData?.data?.thread;

  if (!thread) {
    return 'the post could not be fetched';
  }

  const kind = threadKind(thread);

  if (kind === 'threadViewPost') {
    return null;
  }

  return UNREADABLE_THREAD_TYPES[kind] ?? `the thread came back as ${thread.$type}`;
};

/** Check if a single notification should be responded to based on response rules
 * 
 * This is the first, quick check to see if the notification should be responded to.
 * @param notification - The notification to check
 * @param postData - The post thread data from getSinglePost
 * @param selfHandle - The handle of the account the notification arrived on
 * @returns Whether the notification should be responded to
 */
export const shouldRespondToNotification = (
  notification: BlueskyMessage,
  postData: any,
  selfHandle: string
): boolean => {
  // Rule 0: Only reasons that name a post can be answered
  if (!isRepliableNotification(notification)) {
    console.log(`Skipping @${notification.author}: a ${notification.reason} names no post to answer`);
    return false;
  }

  // Rule 1: Check if author is in ignore list
  const config = getConfig();
  // The handle of the account this notification arrived on, not a single configured one:
  // Oblique answers on several networks and each knows itself by a different name (D-22).
  const configuredHandle: string = normalizeHandle(selfHandle);

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

  // If we can't read the post, skip response — and say which of the four reasons it was
  const unreadable = postUnreadableReason(postData);
  if (unreadable) {
    console.log(`Skipping @${notification.author}: ${unreadable}`);
    return false;
  }

  const thread = postData.data.thread as any;
  
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
  
  // Past both checks: respond. See ARCHITECTURE_LOG.md D-6.
  console.log(`✓ Thread passed thread-level checks (${thread.length} messages)`);
  return thread;
};

