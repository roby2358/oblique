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
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');
      const like: BlueskyMessage = {
        ...baseNotification,
        uri: 'at://did:plc:test/app.bsky.feed.like/3my3tjzprdr24',
        reason: 'like',
      };

      expect(notificationRestraintReason(like, createPostData(false), SELF_HANDLE, new PassRestraint()))
        .toBe('a like names no post to answer');
      expect(notificationRestraintReason(like, undefined, SELF_HANDLE, new PassRestraint()))
        .toBe('a like names no post to answer');
    });

    it('skips authors in the ignore list', async () => {
      getConfigMock.mockReturnValue({
        ignoreList: ['user.test'],
        botList: [],
      });

      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostData(false), SELF_HANDLE, new PassRestraint()))
        .toBe('the author is in the ignore list');
      expect(getConfigMock).toHaveBeenCalled();
    });

    it('skips quote notifications that do not name the account', async () => {
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');
      const notification: BlueskyMessage = {
        ...baseNotification,
        reason: 'quote',
        text: 'Random quote text',
      };

      expect(notificationRestraintReason(notification, createPostData(false), SELF_HANDLE, new PassRestraint()))
        .toBe('a quote that does not name us');
    });

    it('responds to direct mentions without checking for replies', async () => {
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');
      const postData = createPostData(true); // Has replies, but a mention is always answered
      const notification: BlueskyMessage = {
        ...baseNotification,
        reason: 'mention',
      };

      expect(notificationRestraintReason(notification, postData, SELF_HANDLE, new PassRestraint())).toBeNull();
    });

    // R-8, D-28: someone else answering only closes a post partway down a thread. At the top
    // of one there is room for another voice.
    it('skips a reply someone else has already answered', async () => {
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createReplyPostData(['someone.else']), SELF_HANDLE, new PassRestraint()))
        .toBe('someone already replied to this post');
    });

    it('answers a top-level post someone else has already answered', async () => {
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostData(true), SELF_HANDLE, new PassRestraint()))
        .toBeNull();
    });

    // The only duplicate check there is: nothing here remembers across a reload, the network
    // does (D-28)
    it('never answers a post it has answered itself', async () => {
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostDataAnsweredByUs(), SELF_HANDLE, new PassRestraint()))
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
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');

      expect(notificationRestraintReason(baseNotification, createPostData(false), SELF_HANDLE, new PassRestraint()))
        .toBeNull();
      expect(notificationRestraintReason(baseNotification, createReplyPostData([]), SELF_HANDLE, new PassRestraint()))
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
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');

      // the reason the first gate gives is the one the tally counts, so it is the specific
      // one rather than a generic refusal
      expect(notificationRestraintReason(baseNotification, { data: null }, SELF_HANDLE, new PassRestraint()))
        .toBe('the post could not be fetched');
      expect(notificationRestraintReason(baseNotification, null, SELF_HANDLE, new PassRestraint()))
        .toBe('the post could not be fetched');
    });

    it('carries no author, so the same reason tallies across notifications', async () => {
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');
      const other: BlueskyMessage = { ...baseNotification, author: 'someone.else' };

      expect(notificationRestraintReason(other, createPostData(true), SELF_HANDLE, new PassRestraint()))
        .toBe(notificationRestraintReason(baseNotification, createPostData(true), SELF_HANDLE, new PassRestraint()));
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

  // R-9: the second gate. The window counts every author now, and only an @ from a human
  // escapes it (D-29).
  // R-57, D-30: rule 5, one answer per author per pass unless they @ the bot
  describe('notificationRestraintReason across a pass', () => {
    /** Run one author's notifications through a single pass; how many it answers. */
    const answers = async (reasons: string[]): Promise<number> => {
      const { notificationRestraintReason, PassRestraint } = await import('../src/bluesky-polling.js');
      const pass = new PassRestraint();
      let answered = 0;

      for (const reason of reasons) {
        const notification = { ...baseNotification, reason, text: `${SELF_HANDLE} hello` };

        if (notificationRestraintReason(notification, createPostData(false), SELF_HANDLE, pass)) {
          continue;
        }

        pass.answering(notification);
        answered += 1;
      }

      return answered;
    };

    it('answers reply, mention, reply twice', async () => {
      expect(await answers(['reply', 'mention', 'reply'])).toBe(2);
    });

    it('answers reply, mention, mention three times', async () => {
      expect(await answers(['reply', 'mention', 'mention'])).toBe(3);
    });

    it('answers mention, reply twice, because a mention spends nothing', async () => {
      expect(await answers(['mention', 'reply'])).toBe(2);
    });

    it('answers reply, reply once', async () => {
      expect(await answers(['reply', 'reply'])).toBe(1);
    });

    it('counts a quote like a reply', async () => {
      expect(await answers(['quote', 'reply'])).toBe(1);
    });

    it('keeps each author to their own turn', async () => {
      const { PassRestraint } = await import('../src/bluesky-polling.js');
      const pass = new PassRestraint();

      pass.answering(baseNotification);

      expect(pass.hasAnswered('someone.else')).toBe(false);
      expect(pass.hasAnswered('@user.test')).toBe(true);
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

    // Four of the last eight, which is the limit: the thread an alternating conversation
    // reaches on the other party's fourth post
    const flooded = (author: string) => posts([
      'user.one', 'user.two', author, 'user.three',
      author, author, 'user.four', author,
    ]);

    it('declines a thread that came back empty', async () => {
      withBots([]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason([], 'reply')).toBe('the thread came back empty');
    });

    it('declines a bot holding 4 of the last 8 posts, and says which bot', async () => {
      withBots(['bot.alpha']);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      // the reason reaches the declined chain's work product, so it names the author
      expect(threadRestraintReason(flooded('@bot.alpha') as any, 'reply'))
        .toBe('@bot.alpha wrote 4 of the last 8 posts');
    });

    it('answers a bot holding only 3 of the last 8 posts', async () => {
      withBots(['bot.alpha']);

      const thread = posts([
        'user.one', 'user.two', '@bot.alpha', 'user.three',
        'user.four', '@bot.alpha', 'user.five', '@bot.alpha',
      ]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any, 'reply')).toBeNull();
    });

    // The change D-29 makes: a human on the same window as a bot, counted the same way
    it('attenuates a human on the same window as a bot', async () => {
      withBots(['bot.alpha']);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(flooded('chatty.human') as any, 'reply'))
        .toBe('@chatty.human wrote 4 of the last 8 posts');
    });

    it('answers a human holding only 3 of the last 8 posts', async () => {
      withBots([]);

      const thread = posts([
        'user.one', 'user.two', 'chatty.human', 'user.three',
        'user.four', 'chatty.human', 'user.five', 'chatty.human',
      ]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any, 'reply')).toBeNull();
    });

    // The claim D-29 rests on: the window counts Oblique's posts too, so someone taking turns
    // holds half of it and the limit falls on their fourth post — three replies, then stop
    it('stops an alternating conversation on the other party\'s fourth post', async () => {
      withBots([]);

      const turns = (count: number) =>
        posts(Array.from({ length: count * 2 - 1 }, (_unused, index) =>
          index % 2 === 0 ? 'chatty.human' : 'oblique.yuwakisa.com'));

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(turns(3) as any, 'reply')).toBeNull();
      expect(threadRestraintReason(turns(4) as any, 'reply'))
        .toBe('@chatty.human wrote 4 of the last 7 posts');
    });

    it('answers a direct mention as one, and nothing else as one', async () => {
      const { isDirectMention } = await import('../src/bluesky-polling.js');

      expect(isDirectMention('mention')).toBe(true);

      for (const reason of ['reply', 'quote', 'feed', 'like']) {
        expect(isDirectMention(reason)).toBe(false);
      }
    });

    // Someone who typed the handle is asking for an answer, and G-1 is what the page is for
    it('never declines an @ from a human, however much of the thread is theirs', async () => {
      withBots([]);

      const thread = posts([
        'user.one', 'chatty.human', 'chatty.human', 'chatty.human',
        'user.two', 'chatty.human', 'chatty.human', 'chatty.human',
      ]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any, 'mention')).toBeNull();
    });

    // Two bots @ each other by construction, so the exemption would hand back the unbounded
    // loop the window exists to stop (D-7, X-4)
    it('declines an @ from a bot over the limit', async () => {
      withBots(['bot.alpha']);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(flooded('@bot.alpha') as any, 'mention'))
        .toBe('@bot.alpha wrote 4 of the last 8 posts');
    });

    // Nothing the feed produces is ever exempt: nobody asked for it (D-28)
    it('attenuates a feed post like any other', async () => {
      withBots([]);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(flooded('chatty.human') as any, 'feed'))
        .toBe('@chatty.human wrote 4 of the last 8 posts');
    });

    // A prompt-size backstop rather than restraint, so an @ does not escape it: a mention
    // cannot make a thread fit in a context window
    it('declines a thread one post past the limit, and says how long it is', async () => {
      withBots([]);

      const thread = posts(Array.from({ length: 61 }, (_unused, index) => `user.${index}`));

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any, 'reply')).toBe('the thread is 61 posts long');
      expect(threadRestraintReason(thread as any, 'mention')).toBe('the thread is 61 posts long');
    });

    it('answers an ordinary thread', async () => {
      withBots(['bot.alpha']);

      const thread = posts(['user.one', 'user.two', 'user.one']);

      const { threadRestraintReason } = await import('../src/bluesky-polling.js');

      expect(threadRestraintReason(thread as any, 'reply')).toBeNull();
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