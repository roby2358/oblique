// Bluesky Polling Module - Handles notification response logic
import type { BlueskyMessage } from './types/index.js';
import type { BlueskyHistoryEntry, FeedCandidate } from './hooks/bluesky/bluesky-client.js';
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

/** Whether the post a thread view names is itself a reply, rather than the top of a thread. */
const isReplyThread = (thread: any): boolean => {
  return !!thread?.post?.record?.reply;
};

/** The handles that have answered a post already, as the thread view gives them. */
const replyAuthors = (thread: any): string[] => {
  return (thread?.replies || [])
    .map((reply: any) => normalizeHandle(reply?.post?.author?.handle))
    .filter((handle: string) => handle.length > 0);
};

/**
 * Why a post that already has answers should be left alone, or `null` when it should not.
 *
 * Two quite different situations wear the same shape here. Our own handle among the replies
 * means this pass is about to say a second thing to a post we have already answered, and it is
 * the only duplicate check there is: nothing in this page remembers across a reload, and the
 * network does (D-28). Someone *else* having answered only matters partway down a thread —
 * at the top of one there is room for another voice, and a new branch is not an interruption.
 *
 * Asked by both gates that have post data in hand, so the two paths cannot drift apart on what
 * counts as already answered.
 */
export const alreadyAnsweredReason = (postData: any, selfHandle: string): string | null => {
  const thread = postData?.data?.thread;

  if (replyAuthors(thread).includes(normalizeHandle(selfHandle))) {
    return 'we already answered this post';
  }

  // Counted off the replies themselves, not off the authors read out of them: a reply whose
  // author cannot be read is still a reply, and still someone who got there first.
  const replies = (thread?.replies || []).length;

  if (isReplyThread(thread) && replies > 0) {
    return 'someone already replied to this post';
  }

  return null;
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

  // Rule 4: a post we have answered already is never answered twice; a post someone else
  // answered is still open at the top of a thread, where a reply starts a branch rather than
  // interrupting one (D-28)
  return alreadyAnsweredReason(postData, selfHandle);
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

/**
 * Why a post from the timeline should be left alone, or `null` when it could be answered. The
 * feed's equivalent of the first gate, and the stricter of the two: a notification is at least
 * an invitation, and nothing in the feed is (D-28).
 *
 * Every rule is answered from the timeline response alone — the author, the record's reply
 * field and `replyCount` all arrive with the post — so a whole batch is qualified without a
 * single further request, and the paid judgment is spent only on what survives. The same
 * discipline as the notification gate's, where the post is fetched after the cheap rules (R-8).
 *
 * The reasons carry no author, like the notification gate's, so a pass can tally them (D-25).
 */
export const feedRestraintReason = (candidate: FeedCandidate, selfHandle: string): string | null => {
  if (candidate.isRepost) {
    return 'a repost rather than a post';
  }

  const author = normalizeHandle(candidate.message.author);

  if (author === normalizeHandle(selfHandle)) {
    return 'our own post';
  }

  if (getConfig().ignoreList.includes(author)) {
    return 'the author is in the ignore list';
  }

  // D-7 throttles answering a bot that is already talking to us. This declines opening the
  // conversation, which is a different thing and which nobody asked for.
  if (getConfig().botList.includes(author)) {
    return 'the author is a bot';
  }

  // A reply someone has answered is a conversation in progress. A top-level post is fair game
  // whatever its reply count: answering it starts a branch rather than joining one.
  if (candidate.isReply && candidate.replyCount > 0) {
    return 'a reply someone already answered';
  }

  if (!candidate.message.text.trim()) {
    return 'the post has no text to answer';
  }

  return null;
};
