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
 * Why the bot that spoke last is being throttled, or `null` when it is not.
 *
 * Two bots can otherwise answer each other forever. The count is of that one author, not of
 * bots in general, and the limit only engages when a bot spoke last — a human can carry a
 * long exchange without being throttled (D-7).
 */
const botAttenuationReason = (thread: BlueskyHistoryEntry[]): string | null => {
  const recent = thread.slice(-8).map(entry => normalizeHandle(entry.author));
  const lastAuthor = recent[recent.length - 1];

  console.log(`Last ${recent.length} authors: ${recent.join('|')}`);

  if (!getConfig().botList.includes(lastAuthor)) {
    return null;
  }

  const fromLastAuthor = recent.filter(author => author === lastAuthor).length;

  if (fromLastAuthor < 4) {
    return null;
  }

  return `@${lastAuthor} wrote ${fromLastAuthor} of the last ${recent.length} posts`;
};

/**
 * Why the thread should be left alone, or `null` when it should be answered. The second
 * gate, against the whole conversation rather than the one notification.
 *
 * Named rather than answered with a boolean, the way `postUnreadableReason` is at the first
 * gate: a chain that is declined says in its own work product which rule declined it, so
 * restraint is legible in the observer panel instead of silent (D-24).
 */
export const threadRestraintReason = (thread: BlueskyHistoryEntry[]): string | null => {
  if (!thread || thread.length === 0) {
    return 'the thread came back empty';
  }

  const attenuated = botAttenuationReason(thread);

  if (attenuated) {
    return attenuated;
  }

  if (thread.length > 60) {
    return `the thread is ${thread.length} posts long`;
  }

  return null;
};
