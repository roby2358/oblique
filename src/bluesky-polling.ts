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

/**
 * Whether the gate needs the post a notification names.
 *
 * A reason that names no post has nothing to fetch, and a direct mention is answered without
 * consulting the post at all, so the thread read is skipped in both cases. Asked before
 * fetching, so a like costs one line of the notification list and no request (R-8).
 */
export const needsPostData = (notification: BlueskyMessage): boolean => {
  return isRepliableNotification(notification) && notification.reason !== 'mention';
};

/**
 * Why a notification should be left alone, or `null` when it should be answered. The first
 * gate, against the one notification and the post it names.
 *
 * The reason carries no author, so the caller can tally the reasons across a pass and print
 * a short table of them; the author belongs in the line the caller logs (D-25).
 *
 * @param notification - The notification to judge
 * @param postData - The post thread data from getSinglePost, or `null` if it could not be read
 * @param selfHandle - The handle of the account the notification arrived on
 * @returns The reason to decline, or `null` to answer
 */
export const notificationRestraintReason = (
  notification: BlueskyMessage,
  postData: any,
  selfHandle: string
): string | null => {
  // Rule 0: only reasons that name a post can be answered
  if (!isRepliableNotification(notification)) {
    return `a ${notification.reason} names no post to answer`;
  }

  // Rule 1: the ignore list is global — an author not worth answering on one network is not
  // worth answering on another
  if (getConfig().ignoreList.includes(notification.author)) {
    return 'the author is in the ignore list';
  }

  // Rule 2: a quote is only ours to answer if it names us. The handle is the account the
  // notification arrived on, not a single configured one: each network knows Oblique by a
  // different name (D-22).
  const handle = normalizeHandle(selfHandle);

  if (notification.reason === 'quote' && handle && !notification.text.includes(handle)) {
    return 'a quote that does not name us';
  }

  // Rule 3: a direct mention was addressed to the bot, so someone else having replied is
  // irrelevant and nothing below applies
  if (notification.reason === 'mention') {
    return null;
  }

  const unreadable = postUnreadableReason(postData);

  if (unreadable) {
    return unreadable;
  }

  // Rule 4: an existing reply means the conversation no longer needs the bot
  if (postData.data.thread.replies && postData.data.thread.replies.length > 0) {
    return 'someone already replied to this post';
  }

  return null;
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
