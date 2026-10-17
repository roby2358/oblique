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

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).$ = mockJQuery;
    
    // Mock the panels module
    jest.doMock('../src/panels.js', () => ({
      getBlueskyClient: jest.fn(),
      getLLMClient: jest.fn(),
      getOrchestratorState: jest.fn(),
      setOrchestratorState: jest.fn(),
      updateStatus: jest.fn(),
    }));

    // Mock the config module for getConfig
    jest.doMock('../src/config.js', () => ({
      getConfig: jest.fn(() => ({
        ignoreList: []
      })),
    }));

    // Mock the orchestrator module
    jest.doMock('../src/drakidion/orchestrator.js', () => ({
      resumeWaitingTask: jest.fn(),
      addTask: jest.fn(),
    }));

    // Mock the task factory
    jest.doMock('../src/oblique-task-factory.js', () => ({
      createProcessNotificationTask: jest.fn(),
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