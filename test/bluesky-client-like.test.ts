import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BlueskyClient } from '../src/hooks/bluesky/bluesky-client.js';

describe('BlueskyClient like functionality', () => {
  let client: BlueskyClient;
  const mockConfig = {
    handle: 'test.bsky.social',
    appPassword: 'test-password',
  };

  beforeEach(() => {
    client = new BlueskyClient(mockConfig);
    // Mock authenticated state
    (client as any).authenticated = true;
  });

  it('should like a post successfully', async () => {
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';
    const mockResponse = {
      data: {
        uri: 'at://did:plc:test/app.bsky.feed.like/like123',
        cid: 'test-cid-123',
      },
    };

    // Mock the agent's API
    const mockCreateRecord = jest.fn() as any;
    mockCreateRecord.mockResolvedValue(mockResponse);
    const mockAgent = {
      api: {
        com: {
          atproto: {
            repo: {
              createRecord: mockCreateRecord,
            },
          },
        },
      },
    };
    (client as any).agent = mockAgent;

    const result = await client.like(postUri);

    expect(mockCreateRecord).toHaveBeenCalledWith({
      repo: 'test.bsky.social',
      collection: 'app.bsky.feed.like',
      record: {
        subject: {
          uri: postUri,
          cid: '',
        },
        createdAt: expect.any(String),
      },
    });

    expect(result).toEqual({
      uri: 'at://did:plc:test/app.bsky.feed.like/like123',
      cid: 'test-cid-123',
    });
  });

  it('should throw error if not authenticated', async () => {
    (client as any).authenticated = false;
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';

    await expect(client.like(postUri)).rejects.toThrow(
      'Not authenticated. Call authenticate() first.'
    );
  });

  it('should handle API errors gracefully', async () => {
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';
    const apiError = new Error('API Error: Rate limited');
    
    const mockCreateRecord = jest.fn() as any;
    mockCreateRecord.mockRejectedValue(apiError);
    const mockAgent = {
      api: {
        com: {
          atproto: {
            repo: {
              createRecord: mockCreateRecord,
            },
          },
        },
      },
    };
    (client as any).agent = mockAgent;

    await expect(client.like(postUri)).rejects.toThrow('API Error: Rate limited');
  });

  it('should include proper timestamp in like data', async () => {
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';
    const mockResponse = {
      data: {
        uri: 'at://did:plc:test/app.bsky.feed.like/like123',
        cid: 'test-cid-123',
      },
    };

    const mockCreateRecord = jest.fn() as any;
    mockCreateRecord.mockResolvedValue(mockResponse);
    const mockAgent = {
      api: {
        com: {
          atproto: {
            repo: {
              createRecord: mockCreateRecord,
            },
          },
        },
      },
    };
    (client as any).agent = mockAgent;

    const beforeCall = new Date();
    await client.like(postUri);
    const afterCall = new Date();

    const callArgs = mockCreateRecord.mock.calls[0][0] as any;
    const createdAt = new Date(callArgs.record.createdAt);

    expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
    expect(createdAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
  });
});
