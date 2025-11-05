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
      bluesky: {
        handle: 'oblique.yuwakisa.com',
      },
    }));

    await jest.unstable_mockModule('../src/panels.js', () => ({
      getBlueskyClient: jest.fn(),
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

  describe('shouldRespondToNotification', () => {
    it('skips authors in the ignore list', async () => {
      getConfigMock.mockReturnValue({
        ignoreList: ['user.test'],
        botList: [],
        bluesky: { handle: 'oblique.yuwakisa.com' },
      });

      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(false);
      const result = shouldRespondToNotification(baseNotification, postData);
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

      const result = shouldRespondToNotification(notification, postData);

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

      const result = shouldRespondToNotification(notification, postData);

      expect(result).toBe(true);
    });

    it('skips notifications when an existing reply is detected', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(true); // Has replies

      const result = shouldRespondToNotification(baseNotification, postData);

      expect(result).toBe(false);
    });

    it('responds when no replies exist', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = createPostData(false); // No replies

      const result = shouldRespondToNotification(baseNotification, postData);

      expect(result).toBe(true);
    });

    it('skips when post data structure is invalid', async () => {
      const { shouldRespondToNotification } = await import('../src/bluesky-polling.js');
      const postData = { data: null }; // Invalid structure

      const result = shouldRespondToNotification(baseNotification, postData);

      expect(result).toBe(false); // Should skip response when data is invalid
    });
  });

  it('should create toggle handler function', async () => {
    const { createHandleTogglePolling } = await import('../src/bluesky-polling.js');
    const handleToggle = createHandleTogglePolling();
    
    expect(typeof handleToggle).toBe('function');
  });

  it('should handle toggle polling state changes', async () => {
    const { createHandleTogglePolling } = await import('../src/bluesky-polling.js');
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
    const { createHandlePollIntervalChange } = await import('../src/bluesky-polling.js');
    const handleIntervalChange = createHandlePollIntervalChange();
    
    expect(typeof handleIntervalChange).toBe('function');
  });

  it('should validate poll interval input values', async () => {
    const { createHandlePollIntervalChange } = await import('../src/bluesky-polling.js');
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