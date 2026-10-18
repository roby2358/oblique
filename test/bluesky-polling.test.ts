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

  const createPostData = (hasReplies: boolean = false) => ({
    data: {
      thread: {
        $type: 'app.bsky.feed.defs#threadViewPost',
        replies: hasReplies ? [{ uri: 'reply-uri' }] : [],
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

  describe('shouldRespondToNotification', () => {
    it('refuses a like without consulting the post data', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const like: BlueskyMessage = {
        ...baseNotification,
        uri: 'at://did:plc:test/app.bsky.feed.like/3my3tjzprdr24',
        reason: 'like',
      };

      expect(shouldRespondToNotification(like, createPostData(false), SELF_HANDLE)).toBe(false);
      expect(shouldRespondToNotification(like, undefined, SELF_HANDLE)).toBe(false);
    });

    it('skips authors in the ignore list', async () => {
      getConfigMock.mockReturnValue({
        ignoreList: ['user.test'],
        botList: [],
      });

      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(false);
      const result = shouldRespondToNotification(baseNotification, postData, SELF_HANDLE);
      const configResult = getConfigMock.mock.results.at(-1)?.value as any;

      expect(getConfigMock).toHaveBeenCalled();
      expect(configResult).toBeDefined();
      expect(result).toBe(false);
      expect(configResult.ignoreList).toContain('user.test');
    });

    it('skips quote notifications that do not include the configured handle', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(false);
      const notification: BlueskyMessage = {
        ...baseNotification,
        reason: 'quote',
        text: 'Random quote text',
      };

      const result = shouldRespondToNotification(notification, postData, SELF_HANDLE);

      expect(result).toBe(false);
      expect(getConfigMock).toHaveBeenCalled();
    });

    it('responds to direct mentions without checking for replies', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(true); // Has replies, but should still respond to mentions
      const notification: BlueskyMessage = {
        ...baseNotification,
        reason: 'mention',
      };

      const result = shouldRespondToNotification(notification, postData, SELF_HANDLE);

      expect(result).toBe(true);
    });

    it('skips notifications when an existing reply is detected', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(true); // Has replies

      const result = shouldRespondToNotification(baseNotification, postData, SELF_HANDLE);

      expect(result).toBe(false);
    });

    it('responds when no replies exist', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(false); // No replies

      const result = shouldRespondToNotification(baseNotification, postData, SELF_HANDLE);

      expect(result).toBe(true);
    });

    it('skips when post data structure is invalid', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = { data: null }; // Invalid structure

      const result = shouldRespondToNotification(baseNotification, postData, SELF_HANDLE);

      expect(result).toBe(false); // Should skip response when data is invalid
    });
  });

  describe('shouldRespondToThread', () => {
    it('skips threads when the last author is a bot with 4 or more of the last 8 posts', async () => {
      getConfigMock.mockReturnValue({
        ignoreList: [],
        botList: ['bot.alpha'],
        bluesky: { handle: 'oblique.yuwakisa.com' },
      });

      const thread = [
        { author: 'user.one' },
        { author: 'user.two' },
        { author: '@bot.alpha' },
        { author: 'user.three' },
        { author: '@bot.alpha' },
        { author: '@bot.alpha' },
        { author: 'user.four' },
        { author: '@bot.alpha' },
      ];

      const { shouldRespondToThread } = await import('../src/bluesky-polling.js');
      const result = shouldRespondToThread(thread as any);

      expect(result).toBeNull();
    });

    it('continues threads when the last author bot appears fewer than 4 times in the last 8 posts', async () => {
      getConfigMock.mockReturnValue({
        ignoreList: [],
        botList: ['bot.alpha'],
        bluesky: { handle: 'oblique.yuwakisa.com' },
      });

      const thread = [
        { author: 'user.one' },
        { author: 'user.two' },
        { author: '@bot.alpha' },
        { author: 'user.three' },
        { author: 'user.four' },
        { author: '@bot.alpha' },
        { author: 'user.five' },
        { author: '@bot.alpha' },
      ];

      const { shouldRespondToThread } = await import('../src/bluesky-polling.js');
      const result = shouldRespondToThread(thread as any);

      expect(result).toEqual(thread);
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