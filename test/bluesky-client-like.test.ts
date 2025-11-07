import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BlueskyClient } from '../src/hooks/bluesky/bluesky-client.js';

describe('BlueskyClient like functionality', () => {
  let client: BlueskyClient;
  const mockConfig = {
    handle: 'test.bsky.social',
    appPassword: 'test-password',
  };
  let mockGetRecord: any;
  let mockCreateRecord: any;
  let mockLogin: any;
  let mockAgent: any;

  beforeEach(() => {
    client = new BlueskyClient(mockConfig);
    mockGetRecord = jest.fn();
    mockGetRecord.mockResolvedValue({
      data: {
        cid: 'post-cid-default',
      },
    } as any);
    mockCreateRecord = jest.fn();
    mockCreateRecord.mockResolvedValue({
      data: {
        uri: 'at://did:plc:test/app.bsky.feed.like/default',
        cid: 'like-cid-default',
      },
    } as any);
    mockLogin = jest.fn();
    mockLogin.mockResolvedValue(undefined as any);

    mockAgent = {
      login: mockLogin,
      session: {
        accessJwt: 'header.payload.signature',
      },
      api: {
        com: {
          atproto: {
            repo: {
              getRecord: mockGetRecord,
              createRecord: mockCreateRecord,
            },
          },
        },
      },
    };

    (client as any).agent = mockAgent;
    (client as any).authenticated = true;
    (client as any).tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  });

  it('should like a post successfully', async () => {
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';
    const mockPostResponse = {
      data: {
        cid: 'post-cid-123',
      },
    };
    const mockLikeResponse = {
      data: {
        uri: 'at://did:plc:test/app.bsky.feed.like/like123',
        cid: 'test-cid-123',
      },
    };

    // Mock the agent's API
    mockGetRecord.mockResolvedValue(mockPostResponse as any);
    mockCreateRecord.mockResolvedValue(mockLikeResponse as any);
    (client as any).tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const result = await client.like(postUri);

    expect(mockGetRecord).toHaveBeenCalledWith({
      repo: 'did:plc:test',
      collection: 'app.bsky.feed.post',
      rkey: 'test123',
    });

    expect(mockCreateRecord).toHaveBeenCalledWith({
      repo: 'test.bsky.social',
      collection: 'app.bsky.feed.like',
      record: {
        subject: {
          uri: postUri,
          cid: 'post-cid-123',
        },
        createdAt: expect.any(String),
      },
    });

    expect(result).toEqual({
      uri: 'at://did:plc:test/app.bsky.feed.like/like123',
      cid: 'test-cid-123',
    });
  });

  it('should propagate authentication errors', async () => {
    (client as any).authenticated = false;
    (client as any).tokenExpiresAt = new Date(Date.now() - 10 * 60 * 1000);
    const authError = new Error('Invalid identifier or password');
    mockLogin.mockRejectedValue(authError as any);
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';

    await expect(client.like(postUri)).rejects.toThrow('Invalid identifier or password');
    expect(mockLogin).toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';
    const apiError = new Error('API Error: Rate limited');
    
    mockCreateRecord.mockRejectedValue(apiError as any);

    await expect(client.like(postUri)).rejects.toThrow('API Error: Rate limited');
  });

  it('should include proper timestamp in like data', async () => {
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';
    const mockPostResponse = {
      data: {
        cid: 'post-cid-123',
      },
    };
    const mockLikeResponse = {
      data: {
        uri: 'at://did:plc:test/app.bsky.feed.like/like123',
        cid: 'test-cid-123',
      },
    };

    mockGetRecord.mockResolvedValue(mockPostResponse as any);
    mockCreateRecord.mockResolvedValue(mockLikeResponse as any);

    const beforeCall = new Date();
    await client.like(postUri);
    const afterCall = new Date();

    const callArgs = mockCreateRecord.mock.calls[0][0] as any;
    const createdAt = new Date(callArgs.record.createdAt);

    expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
    expect(createdAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
  });

  it('should handle CID fetch failure gracefully', async () => {
    const postUri = 'at://did:plc:test/app.bsky.feed.post/test123';
    const mockLikeResponse = {
      data: {
        uri: 'at://did:plc:test/app.bsky.feed.like/like123',
        cid: 'test-cid-123',
      },
    };

    mockGetRecord.mockRejectedValue(new Error('Post not found') as any);
    mockCreateRecord.mockResolvedValue(mockLikeResponse as any);

    const result = await client.like(postUri);

    // Should still succeed with empty CID
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
});
