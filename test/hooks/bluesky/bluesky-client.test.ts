import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BlueskyClient } from '../../../src/hooks/bluesky/bluesky-client.js';
import type { BlueskyMessage } from '../../../src/types/index.js';

describe('BlueskyClient', () => {
  let client: BlueskyClient;
  const mockConfig = {
    handle: 'test.bsky.social',
    appPassword: 'test-password'
  };

  const mockNotification: BlueskyMessage = {
    uri: 'at://did:plc:test/app.bsky.feed.post/test123',
    cid: 'bafytest123',
    author: 'testuser.bsky.social',
    text: 'Hello Oblique!',
    createdAt: new Date(),
  };

  beforeEach(() => {
    client = new BlueskyClient(mockConfig);
    // Mock the authenticate method to avoid actual API calls
    jest.spyOn(client, 'authenticate').mockResolvedValue();
    // Set authenticated to true for testing
    (client as any).authenticated = true;
  });

  describe('hasRepliesToPost', () => {
    it('should return true when post has direct replies', async () => {
      const mockAgent = {
        getPostThread: jest.fn()
      };
      (mockAgent.getPostThread as any).mockResolvedValue({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            replies: [
              { post: { uri: 'reply1', record: { text: 'First reply' } } },
              { post: { uri: 'reply2', record: { text: 'Second reply' } } }
            ]
          }
        }
      });
      (client as any).agent = mockAgent;

      const result = await client.hasRepliesToPost(mockNotification);
      
      expect(result).toBe(true);
      expect(mockAgent.getPostThread).toHaveBeenCalledWith({ 
        uri: mockNotification.uri,
        depth: 1,
        parentHeight: 0
      });
    });

    it('should return false when post has no direct replies', async () => {
      const mockAgent = {
        getPostThread: jest.fn()
      };
      (mockAgent.getPostThread as any).mockResolvedValue({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            replies: []
          }
        }
      });
      (client as any).agent = mockAgent;

      const result = await client.hasRepliesToPost(mockNotification);
      
      expect(result).toBe(false);
    });

    it('should return false when replies property is undefined', async () => {
      const mockAgent = {
        getPostThread: jest.fn()
      };
      (mockAgent.getPostThread as any).mockResolvedValue({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost'
            // replies property is undefined
          }
        }
      });
      (client as any).agent = mockAgent;

      const result = await client.hasRepliesToPost(mockNotification);
      
      expect(result).toBe(false);
    });

    it('should throw error when not authenticated', async () => {
      (client as any).authenticated = false;

      await expect(client.hasRepliesToPost(mockNotification)).rejects.toThrow(
        'Not authenticated. Call authenticate() first.'
      );
    });
  });
});
