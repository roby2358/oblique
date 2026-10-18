import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Simple test for the polling functionality
describe('Bluesky Polling Module', () => {
  // Mock jQuery globally
  const mockJQuery = jest.fn(() => ({
    text: jest.fn().mockReturnThis(),
    addClass: jest.fn().mockReturnThis(),
    removeClass: jest.fn().mockReturnThis(),
    prop: jest.fn().mockReturnThis(),
    val: jest.fn().mockReturnValue('60'), // Mock val() method for input elements
  }));

  // ESM: the modules under test import these statically, so they are replaced with
  // unstable_mockModule before the dynamic import, not with doMock (which never intercepts
  // an ES module and leaves the real config in place, where ignoreList is undefined)
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    (global as any).$ = mockJQuery;

    await jest.unstable_mockModule('../src/panels.js', () => ({
      getBlueskyAccounts: jest.fn(() => []),
      getLLMClient: jest.fn(),
      getOrchestratorState: jest.fn(),
      setOrchestratorState: jest.fn(),
      updateStatus: jest.fn(),
    }));

    await jest.unstable_mockModule('../src/config.js', () => ({
      getConfig: jest.fn(() => ({
        ignoreList: [],
        botList: [],
      })),
    }));

    await jest.unstable_mockModule('../src/drakidion/orchestrator.js', () => ({
      resumeWaitingTask: jest.fn(),
      addTask: jest.fn(),
    }));

    // checkAccount creates one reply task per notification it answers, so the factory has
    // to answer with something task-shaped
    await jest.unstable_mockModule('../src/oblique-task-factory.js', () => ({
      createReplyTask: jest.fn((notification: any) => ({
        taskId: `task-${notification.author}`,
        status: 'ready',
      })),
    }));
  });

  // R-21: one notification's failed fetch skips that notification, not the batch
  describe('fetchPostData', () => {
    const notif = {
      uri: 'at://did:plc:test/app.bsky.feed.post/abc',
      cid: 'cid-1',
      author: 'user.test',
      text: 'Hello',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      reason: 'mention',
    };

    it('returns what Bluesky gives it', async () => {
      const { fetchPostData } = await import('../src/bluesky-panel.js');
      const postData = { data: { thread: { $type: 'app.bsky.feed.defs#threadViewPost' } } };
      const client = { getSinglePost: jest.fn<any>().mockResolvedValue(postData) } as any;

      await expect(fetchPostData(client, notif)).resolves.toBe(postData);
    });

    it('returns null rather than throwing when the fetch fails', async () => {
      const { fetchPostData } = await import('../src/bluesky-panel.js');
      const client = {
        getSinglePost: jest.fn<any>().mockRejectedValue(new Error('400 Bad Request')),
      } as any;

      await expect(fetchPostData(client, notif)).resolves.toBeNull();
    });
  });

  // R-39: one account's failure is reported against that account, never thrown at the batch
  describe('checkAccount', () => {
    const accountWith = (client: any) => ({
      name: 'delvetown',
      handle: 'oblique.delve.town',
      client,
    });

    it('reports the reason an account could not be checked, rather than throwing', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { checkAccount } = await import('../src/bluesky-panel.js');
      const client = {
        ensureAuth: jest.fn<any>().mockRejectedValue(new Error('Invalid identifier or password')),
      };

      const check = await checkAccount(accountWith(client) as any, {} as any, jest.fn(), false);

      expect(check.error).toBe('Invalid identifier or password');
      expect(check.tasks).toEqual([]);
      warn.mockRestore();
    });

    it('splits the notifications it answers from the reasons it passed over', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const { checkAccount } = await import('../src/bluesky-panel.js');

      const notif = (reason: string, author: string) => ({
        uri: `at://did:plc:test/app.bsky.feed.post/${author}`,
        cid: `cid-${author}`,
        author,
        text: 'hello',
        createdAt: new Date(),
        reason,
      });

      const client = {
        ensureAuth: jest.fn<any>().mockResolvedValue(undefined),
        getNotifications: jest.fn<any>().mockResolvedValue([
          notif('mention', 'answered.one'),
          notif('follow', 'follower.one'),
          notif('like', 'liker.one'),
        ]),
        markNotificationsAsSeen: jest.fn<any>().mockResolvedValue(undefined),
        // a mention is answered without the post, so nothing here should be asked for it
        getSinglePost: jest.fn<any>(),
      };

      const check = await checkAccount(accountWith(client) as any, {} as any, jest.fn(), false);

      expect(check.error).toBeNull();
      expect(check.answered.map(notification => notification.author)).toEqual(['answered.one']);
      expect(check.declined).toEqual([
        'a follow names no post to answer',
        'a like names no post to answer',
      ]);
      expect(check.tasks).toHaveLength(1);
      expect(client.getSinglePost).not.toHaveBeenCalled();
      log.mockRestore();
    });

    it('creates no task and marks nothing seen when an account has no notifications', async () => {
      const { checkAccount } = await import('../src/bluesky-panel.js');
      const client = {
        ensureAuth: jest.fn<any>().mockResolvedValue(undefined),
        getNotifications: jest.fn<any>().mockResolvedValue([]),
        markNotificationsAsSeen: jest.fn<any>().mockResolvedValue(undefined),
      };

      const check = await checkAccount(accountWith(client) as any, {} as any, jest.fn(), true);

      expect(check.error).toBeNull();
      expect(check.tasks).toEqual([]);
      expect(check.answered).toEqual([]);
      expect(check.declined).toEqual([]);
      expect(client.markNotificationsAsSeen).not.toHaveBeenCalled();
    });
  });

  // D-25: the panel reports the reasons as a tally, not one line per notification
  describe('tallyReasons', () => {
    it('counts each reason once and puts the commonest first', async () => {
      const { tallyReasons } = await import('../src/bluesky-panel.js');

      const tally = tallyReasons([
        'someone already replied to this post',
        'a follow names no post to answer',
        'someone already replied to this post',
        'the post is gone',
        'someone already replied to this post',
      ]);

      expect(tally).toEqual([
        { reason: 'someone already replied to this post', count: 3 },
        { reason: 'a follow names no post to answer', count: 1 },
        { reason: 'the post is gone', count: 1 },
      ]);
    });

    it('answers nothing for a pass that declined nothing', async () => {
      const { tallyReasons } = await import('../src/bluesky-panel.js');

      expect(tallyReasons([])).toEqual([]);
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
});