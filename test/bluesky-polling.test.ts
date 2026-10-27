import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { BlueskyMessage } from '../src/types/index.js';

// Simple test for the polling functionality
describe('Bluesky Polling Module', () => {
  // Mock jQuery globally
  const mockJQuery = jest.fn(() => ({
    text: jest.fn().mockReturnThis(),
    addClass: jest.fn().mockReturnThis(),
    removeClass: jest.fn().mockReturnThis(),
    prop: jest.fn().mockReturnThis(),
    val: jest.fn().mockReturnThis(),
  }));

  let getConfigMock: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    (global as any).$ = mockJQuery;

    getConfigMock = jest.fn(() => ({
      ignoreList: [],
      botList: [],
    }));

    await jest.unstable_mockModule('../src/panels.js', () => ({
      getBlueskyAccounts: jest.fn(() => []),
      getLLMClient: jest.fn(),
      getJevClient: jest.fn(),
      getOrchestratorState: jest.fn(),
      setOrchestratorState: jest.fn(),
      updateStatus: jest.fn(),
    }));

    await jest.unstable_mockModule('../src/config.js', () => ({
      getConfig: getConfigMock,
    }));

    await jest.unstable_mockModule('../src/drakidion/orchestrator.js', () => ({
      resumeWaitingTask: jest.fn(),
      addTask: jest.fn(),
    }));

    await jest.unstable_mockModule('../src/oblique-task-factory.js', () => ({
      createReplyTask: jest.fn(),
      createProcessNotificationTask: jest.fn(),
    }));
  });

  // The handle of the account a notification arrived on. Each network knows Oblique by a
  // different name, so the gate is told which one rather than reading a single config value.
  const SELF_HANDLE = 'oblique.yuwakisa.com';

  const baseNotification: BlueskyMessage = {
    uri: 'at://example.app/bsky.app/post/1',
    cid: 'cid-1',
    author: 'user.test',
    text: 'Hello there',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    reason: 'reply',
  };

  // A thread view for a top-level post: nothing in `record.reply`, so answering it starts a
  // branch rather than joining a conversation (R-8, D-28)
  const createPostData = (hasReplies: boolean = false) => ({
    data: {
      thread: {
        $type: 'app.bsky.feed.defs#threadViewPost',
        post: { record: { text: 'Hello there' } },
        replies: hasReplies ? [{ post: { author: { handle: 'someone.else' } } }] : [],
      },
    },
  });

  /** A thread view for a post that is itself a reply, answered by the handles given. */
  const createReplyPostData = (replyAuthors: string[]) => ({
    data: {
      thread: {
        $type: 'app.bsky.feed.defs#threadViewPost',
        post: { record: { text: 'Hello there', reply: { root: {}, parent: {} } } },
        replies: replyAuthors.map(handle => ({ post: { author: { handle } } })),
      },
    },
  });

  /** A top-level post that Oblique itself has already answered. */
  const createPostDataAnsweredByUs = () => ({
    data: {
      thread: {
        $type: 'app.bsky.feed.defs#threadViewPost',
        post: { record: { text: 'Hello there' } },
        replies: [{ post: { author: { handle: SELF_HANDLE } } }],
      },
    },
  });

  // R-8: a like, repost or follow names no post, so it is refused before anything is fetched
  describe('isRepliableNotification', () => {
    it('accepts the reasons that name a post', async () => {
      const { isRepliableNotification } = await import('../src/bluesky-polling.js');

      for (const reason of ['mention', 'reply', 'quote']) {
        expect(isRepliableNotification({ ...baseNotification, reason })).toBe(true);
      }
    });

    it('refuses the reasons whose uri is not a post', async () => {
      const { isRepliableNotification } = await import('../src/bluesky-polling.js');

      for (const reason of ['like', 'repost', 'follow', 'starterpack-joined']) {
        expect(isRepliableNotification({ ...baseNotification, reason })).toBe(false);
      }
    });
  });

  // R-8: an unreadable post is not evidence of a deleted one
  describe('postUnreadableReason', () => {
    const threadOf = ($type: string) => ({ data: { thread: { $type } } });

    it('reads a thread view post', async () => {
      const { postUnreadableReason } = await import('../src/bluesky-polling.js');

      expect(postUnreadableReason(createPostData(false))).toBeNull();
    });

    it('tells a gone post from a blocked one', async () => {
      const { postUnreadableReason } = await import('../src/bluesky-polling.js');

      expect(postUnreadableReason(threadOf('app.bsky.feed.defs#notFoundPost')))
        .toBe('the post is gone');
      expect(postUnreadableReason(threadOf('app.bsky.feed.defs#blockedPost')))
        .toBe('the post is blocked, by us or by its author');
    });

    it('tells a failed fetch from an unhandled thread type', async () => {
      const { postUnreadableReason } = await import('../src/bluesky-polling.js');

      expect(postUnreadableReason(null)).toBe('the post could not be fetched');
      expect(postUnreadableReason({ data: {} })).toBe('the post could not be fetched');
      expect(postUnreadableReason(threadOf('app.bsky.feed.defs#somethingNew')))
        .toBe('the thread came back as app.bsky.feed.defs#somethingNew');
    });

    // D-23: each network namespaces its own copy of the thread union, so only the fragment
    // after the # is common to all of them
    it('reads the same four cases on a network with its own lexicon', async () => {
      const { postUnreadableReason } = await import('../src/bluesky-polling.js');

      expect(postUnreadableReason(threadOf('town.delve.feed.defs#threadViewPost'))).toBeNull();
      expect(postUnreadableReason(threadOf('town.delve.feed.defs#notFoundPost')))
        .toBe('the post is gone');
      expect(postUnreadableReason(threadOf('town.delve.feed.defs#blockedPost')))
        .toBe('the post is blocked, by us or by its author');
      expect(postUnreadableReason(threadOf('town.delve.feed.defs#somethingNew')))
        .toBe('the thread came back as town.delve.feed.defs#somethingNew');
    });

    it('treats a thread with no usable $type as unreadable', async () => {
      const { postUnreadableReason, threadKind } = await import('../src/bluesky-polling.js');

      expect(threadKind({ $type: 'town.delve.feed.defs' })).toBe('');
      expect(threadKind({})).toBe('');
      expect(postUnreadableReason(threadOf('no-fragment-here')))
        .toBe('the thread came back as no-fragment-here');
    });
  });

  describe('notificationRestraintReason', () => {
    it('refuses a like without consulting the post data', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');
      const like: BlueskyMessage = {
        ...baseNotification,
        uri: 'at://did:plc:test/app.bsky.feed.like/3my3tjzprdr24',
        reason: 'like',
      };

      expect(notificationRestraintReason(like, createPostData(false), SELF_HANDLE))
        .toBe('a like names no post to answer');
      expect(notificationRestraintReason(like, undefined, SELF_HANDLE))
        .toBe('a like names no post to answer');
    });

    it('skips authors in the ignore list', async () => {
      getConfigMock.mockReturnValue({
        ignoreList: ['user.test'],
        botList: [],
      });

      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostData(false), SELF_HANDLE))
        .toBe('the author is in the ignore list');
      expect(getConfigMock).toHaveBeenCalled();
    });

    it('skips quote notifications that do not name the account', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');
      const notification: BlueskyMessage = {
        ...baseNotification,
        reason: 'quote',
        text: 'Random quote text',
      };

      expect(notificationRestraintReason(notification, createPostData(false), SELF_HANDLE))
        .toBe('a quote that does not name us');
    });

    it('responds to direct mentions without checking for replies', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');
      const postData = createPostData(true); // Has replies, but a mention is always answered
      const notification: BlueskyMessage = {
        ...baseNotification,
        reason: 'mention',
      };

      expect(notificationRestraintReason(notification, postData, SELF_HANDLE)).toBeNull();
    });

    // R-8, D-28: someone else answering only closes a post partway down a thread. At the top
    // of one there is room for another voice.
    it('skips a reply someone else has already answered', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createReplyPostData(['someone.else']), SELF_HANDLE))
        .toBe('someone already replied to this post');
    });

    it('answers a top-level post someone else has already answered', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostData(true), SELF_HANDLE))
        .toBeNull();
    });

    // The only duplicate check there is: nothing here remembers across a reload, the network
    // does (D-28)
    it('never answers a post it has answered itself', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostDataAnsweredByUs(), SELF_HANDLE))
        .toBe('we already answered this post');
    });

    it('answers its own past reply whatever the handle looks like', async () => {
      const { alreadyAnsweredReason } = await import('../src/bluesky-polling.js');

      // the handle is compared normalized, because each network spells Oblique differently and
      // the replies carry it without the @ (D-22)
      expect(alreadyAnsweredReason(createPostDataAnsweredByUs(), `@${SELF_HANDLE}`))
        .toBe('we already answered this post');
    });

    it('responds when no replies exist', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostData(false), SELF_HANDLE))
        .toBeNull();
      expect(notificationRestraintReason(baseNotification, createReplyPostData([]), SELF_HANDLE))
        .toBeNull();
    });

    // A reply whose author cannot be read is still a reply, and still someone who got there
    // first — the count comes off the replies, not off the handles read out of them
    it('counts a reply it cannot attribute', async () => {
      const { alreadyAnsweredReason } = await import('../src/bluesky-polling.js');
      const postData = createReplyPostData([]);
      postData.data.thread.replies = [{ post: {} } as any];

      expect(alreadyAnsweredReason(postData, SELF_HANDLE))
        .toBe('someone already replied to this post');
    });

    it('passes the unreadable reason through when the post cannot be read', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');

      // the reason the first gate gives is the one the tally counts, so it is the specific
      // one rather than a generic refusal
      expect(notificationRestraintReason(baseNotification, { data: null }, SELF_HANDLE))
        .toBe('the post could not be fetched');
      expect(notificationRestraintReason(baseNotification, null, SELF_HANDLE))
        .toBe('the post could not be fetched');
    });

    it('carries no author, so the same reason tallies across notifications', async () => {
      const { notificationRestraintReason } = await import('../src/bluesky-polling.js');
      const other: BlueskyMessage = { ...baseNotification, author: 'someone.else' };

      expect(notificationRestraintReason(other, createPostData(true), SELF_HANDLE))
        .toBe(notificationRestraintReason(baseNotification, createPostData(true), SELF_HANDLE));
    });
  });

  describe('needsPostData', () => {
    it('asks for the post only when the gate will consult it', async () => {
      const { needsPostData } = await import('../src/bluesky-polling.js');
      const as = (reason: string) => ({ ...baseNotification, reason }) as BlueskyMessage;

      expect(needsPostData(as('reply'))).toBe(true);
      expect(needsPostData(as('quote'))).toBe(true);
      // a mention is answered whatever the post says, and a like names no post at all
      expect(needsPostData(as('mention'))).toBe(false);
      expect(needsPostData(as('like'))).toBe(false);
      expect(needsPostData(as('follow'))).toBe(false);
    });
  });

  // R-52: the feed gate, which is answered from the timeline response alone — every rule here
  // runs without a request, so a whole batch is qualified before anything is paid for
  describe('feedRestraintReason', () => {
    const candidate = (over: any = {}) => ({
      message: { ...baseNotification, reason: 'feed', author: 'stranger.test', ...over.message },
      replyCount: 0,
      isReply: false,
      isRepost: false,
      ...over,
    });

    it('answers a top-level post from a stranger', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      expect(feedRestraintReason(candidate(), SELF_HANDLE)).toBeNull();
    });

    // The whole point of the relaxed rule: a top-level post stays open however busy it is
    it('answers a top-level post that already has replies', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      expect(feedRestraintReason(candidate({ replyCount: 12 }), SELF_HANDLE)).toBeNull();
    });

    it('answers a reply nobody has answered', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      expect(feedRestraintReason(candidate({ isReply: true }), SELF_HANDLE)).toBeNull();
    });

    it('declines a reply someone already answered', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      expect(feedRestraintReason(candidate({ isReply: true, replyCount: 1 }), SELF_HANDLE))
        .toBe('a reply someone already answered');
    });

    it('declines a repost', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      expect(feedRestraintReason(candidate({ isRepost: true }), SELF_HANDLE))
        .toBe('a repost rather than a post');
    });

    it('declines our own post, however the handle is spelled', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      for (const author of [SELF_HANDLE, `@${SELF_HANDLE}`]) {
        expect(feedRestraintReason(candidate({ message: { author } }), SELF_HANDLE))
          .toBe('our own post');
      }
    });

    it('declines an author in the ignore list', async () => {
      getConfigMock.mockReturnValue({ ignoreList: ['stranger.test'], botList: [] });
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      expect(feedRestraintReason(candidate(), SELF_HANDLE))
        .toBe('the author is in the ignore list');
    });

    // D-7 throttles answering a bot already talking to us; opening the conversation is refused
    // outright
    it('declines a bot rather than attenuating it', async () => {
      getConfigMock.mockReturnValue({ ignoreList: [], botList: ['stranger.test'] });
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      expect(feedRestraintReason(candidate(), SELF_HANDLE)).toBe('the author is a bot');
    });

    it('declines a post with nothing to answer', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      for (const text of ['', '   ']) {
        expect(feedRestraintReason(candidate({ message: { text } }), SELF_HANDLE))
          .toBe('the post has no text to answer');
      }
    });

    it('carries no author, so a look can tally its reasons', async () => {
      const { feedRestraintReason } = await import('../src/bluesky-polling.js');

      const first = feedRestraintReason(candidate({ isRepost: true, message: { author: 'one.test' } }), SELF_HANDLE);
      const second = feedRestraintReason(candidate({ isRepost: true, message: { author: 'two.test' } }), SELF_HANDLE);

      expect(first).toBe(second);
    });
  });

  describe('threadRestraintReason', () => {
    const withBots = (botList: string[]) => {
      getConfigMock.mockReturnValue({
        ignoreList: [],
        botList,
        bluesky: { handle: 'oblique.yuwakisa.com' },
      });
    };

    const posts = (authors: string[]) => authors.map(author => ({ author, text: 'x' }));

    it('declines a thread that came back empty', async () => {
      withBots([]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason([])).toBe('the thread came back empty');
    });

    it('declines a bot holding 4 of the last 8 posts, and says which bot', async () => {
      withBots(['bot.alpha']);

      const thread = posts([
        'user.one', 'user.two', '@bot.alpha', 'user.three',
        '@bot.alpha', '@bot.alpha', 'user.four', '@bot.alpha',
      ]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      // the reason reaches the declined chain's work product, so it names the author
      expect(threadRestraintReason(thread as any)).toBe('@bot.alpha wrote 4 of the last 8 posts');
    });

    it('answers a bot holding only 3 of the last 8 posts', async () => {
      withBots(['bot.alpha']);

      const thread = posts([
        'user.one', 'user.two', '@bot.alpha', 'user.three',
        'user.four', '@bot.alpha', 'user.five', '@bot.alpha',
      ]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any)).toBeNull();
    });

    it('never attenuates a human, however much of the thread is theirs', async () => {
      withBots(['bot.alpha']);

      const thread = posts([
        'user.one', 'chatty.human', 'chatty.human', 'chatty.human',
        'user.two', 'chatty.human', 'chatty.human', 'chatty.human',
      ]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any)).toBeNull();
    });

    it('declines a thread one post past the limit, and says how long it is', async () => {
      withBots([]);

      const thread = posts(Array.from({ length: 61 }, (_, index) => `user.${index}`));

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any)).toBe('the thread is 61 posts long');
    });

    it('answers an ordinary thread', async () => {
      withBots(['bot.alpha']);

      const thread = posts(['user.one', 'user.two', 'user.one']);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any)).toBeNull();
    });
  });

  it('should create toggle handler function', async () => {
    const { createHandleTogglePolling } = await import('../src/bluesky-panel.js');
    const handleToggle = createHandleTogglePolling();
    
    expect(typeof handleToggle).toBe('function');
  });

  it('should handle toggle polling state changes', async () => {
    const { createHandleTogglePolling } = await import('../src/bluesky-panel.js');
    const handleToggle = createHandleTogglePolling();
    
    jest.useFakeTimers();
    
    // First call should start polling
    handleToggle();
    
    // Verify jQuery was called for UI updates
    expect(mockJQuery).toHaveBeenCalledWith('#toggle-polling');
    expect(mockJQuery).toHaveBeenCalledWith('#polling-status');
    
    jest.useRealTimers();
  });

  it('should create poll interval change handler function', async () => {
    const { createHandlePollIntervalChange } = await import('../src/bluesky-panel.js');
    const handleIntervalChange = createHandlePollIntervalChange();
    
    expect(typeof handleIntervalChange).toBe('function');
  });

  it('should validate poll interval input values', async () => {
    const { createHandlePollIntervalChange } = await import('../src/bluesky-panel.js');
    const handleIntervalChange = createHandlePollIntervalChange();
    
    // Mock jQuery to return different values for val() calls
    const mockVal = jest.fn();
    const mockJQueryInstance = {
      val: mockVal,
      text: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      prop: jest.fn().mockReturnThis(),
    };
    
    mockJQuery.mockReturnValue(mockJQueryInstance);

    // Test with invalid value (too low)
    mockVal.mockReturnValue('5');
    handleIntervalChange();
    expect(mockVal).toHaveBeenCalledTimes(2); // Once to get value, once to set corrected value
    expect(mockVal).toHaveBeenNthCalledWith(2, '10'); // Second call should set the corrected value

    // Reset mock
    mockVal.mockClear();

    // Test with invalid value (too high)
    mockVal.mockReturnValue('4000');
    handleIntervalChange();
    expect(mockVal).toHaveBeenCalledTimes(2); // Once to get value, once to set corrected value
    expect(mockVal).toHaveBeenNthCalledWith(2, '3600'); // Second call should set the corrected value
  });
});