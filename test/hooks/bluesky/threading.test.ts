import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BlueskyClient } from '../../../src/hooks/bluesky/bluesky-client.js';
import type { BlueskyMessage } from '../../../src/types/index.js';

describe('BlueskyClient Threading', () => {
  let client: BlueskyClient;
  let authenticateSpy: jest.SpiedFunction<BlueskyClient['authenticate']>;
  const mockConfig = {
    handle: 'test.bsky.social',
    appPassword: 'test-password'
  };

  beforeEach(() => {
    client = new BlueskyClient(mockConfig);
    // Mock the authenticate method to avoid actual API calls
    authenticateSpy = jest.spyOn(client, 'authenticate').mockResolvedValue();
    // Set authenticated to true for testing
    (client as any).authenticated = true;
    (client as any).tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  });

  describe('getThreadHistory', () => {
    it('should fetch multiple messages in a thread', async () => {
      const mockNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/current',
        cid: 'bafycurrent',
        author: 'current.bsky.social',
        text: 'Current message',
        createdAt: new Date(),
        reason: 'reply',
        replyInfo: {
          root: { uri: 'at://did:plc:test/app.bsky.feed.post/root', cid: 'bafyroot' },
          parent: { uri: 'at://did:plc:test/app.bsky.feed.post/parent1', cid: 'bafyparent1' }
        }
      };

      // Mock the agent with a chain of posts
      const mockAgent = {
        getPostThread: jest.fn()
      };

      // Mock responses for the thread traversal
      (mockAgent.getPostThread as any)
        .mockResolvedValueOnce({
          data: {
            thread: {
              $type: 'app.bsky.feed.defs#threadViewPost',
              post: {
                uri: 'at://did:plc:test/app.bsky.feed.post/parent1',
                author: { handle: 'parent1.bsky.social' },
                record: { text: 'Parent 1 message' }
              },
              parent: {
                $type: 'app.bsky.feed.defs#threadViewPost',
                post: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/parent2',
                  author: { handle: 'parent2.bsky.social' },
                  record: { text: 'Parent 2 message' }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            thread: {
              $type: 'app.bsky.feed.defs#threadViewPost',
              post: {
                uri: 'at://did:plc:test/app.bsky.feed.post/parent2',
                author: { handle: 'parent2.bsky.social' },
                record: { text: 'Parent 2 message' }
              },
              parent: {
                $type: 'app.bsky.feed.defs#threadViewPost',
                post: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/parent3',
                  author: { handle: 'parent3.bsky.social' },
                  record: { text: 'Parent 3 message' }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            thread: {
              $type: 'app.bsky.feed.defs#threadViewPost',
              post: {
                uri: 'at://did:plc:test/app.bsky.feed.post/parent3',
                author: { handle: 'parent3.bsky.social' },
                record: { text: 'Parent 3 message' }
              },
              parent: null // No more parents
            }
          }
        })
        // Mock the additional call to fetch current post data
        .mockResolvedValueOnce({
          data: {
            thread: {
              $type: 'app.bsky.feed.defs#threadViewPost',
              post: {
                uri: 'at://did:plc:test/app.bsky.feed.post/current',
                author: { handle: 'current.bsky.social' },
                record: { text: 'Current message' }
              }
            }
          }
        });

      (client as any).agent = mockAgent;

      const result = await client.getThreadHistory(mockNotification, 10);

      // Should have 3 messages total (2 parents + current)
      expect(result).toHaveLength(3);
      
      // Check chronological order (oldest first)
      expect(result[0].author).toBe('parent2.bsky.social');
      expect(result[0].text).toBe('Parent 2 message');
      
      expect(result[1].author).toBe('parent1.bsky.social');
      expect(result[1].text).toBe('Parent 1 message');
      
      expect(result[2].author).toBe('current.bsky.social');
      expect(result[2].text).toBe('Current message');

      // Verify API call was made correctly (1 for thread + 1 for current post)
      expect(mockAgent.getPostThread).toHaveBeenCalledTimes(2);
      expect(mockAgent.getPostThread).toHaveBeenCalledWith({
        uri: 'at://did:plc:test/app.bsky.feed.post/parent1',
        depth: 0,
        parentHeight: 10
      });
    });

    it('should handle messages with no replyInfo', async () => {
      const mockNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/standalone',
        cid: 'bafystandalone',
        author: 'standalone.bsky.social',
        text: 'Standalone message',
        createdAt: new Date(),
        reason: 'mention',
        // No replyInfo
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };

      (mockAgent.getPostThread as any).mockResolvedValue({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              uri: 'at://did:plc:test/app.bsky.feed.post/standalone',
              author: { handle: 'standalone.bsky.social' },
              record: { text: 'Standalone message' }
            }
          }
        }
      });

      (client as any).agent = mockAgent;

      const result = await client.getThreadHistory(mockNotification, 10);

      // Should only have the current message
      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('standalone.bsky.social');
      expect(result[0].text).toBe('Standalone message');
      
      // Verify API call was made for current post
      expect(mockAgent.getPostThread).toHaveBeenCalledTimes(1);
      expect(mockAgent.getPostThread).toHaveBeenCalledWith({
        uri: 'at://did:plc:test/app.bsky.feed.post/standalone',
        depth: 0,
        parentHeight: 0
      });
    });

    it('should respect maxDepth parameter', async () => {
      const mockNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/current',
        cid: 'bafycurrent',
        author: 'current.bsky.social',
        text: 'Current message',
        createdAt: new Date(),
        reason: 'reply',
        replyInfo: {
          root: { uri: 'at://did:plc:test/app.bsky.feed.post/root', cid: 'bafyroot' },
          parent: { uri: 'at://did:plc:test/app.bsky.feed.post/parent1', cid: 'bafyparent1' }
        }
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };

      // Mock a long chain of posts
      (mockAgent.getPostThread as any).mockImplementation(({ uri }: { uri: string }) => {
        // Handle the current post call (for alt text extraction)
        if (uri.includes('current')) {
          return Promise.resolve({
            data: {
              thread: {
                $type: 'app.bsky.feed.defs#threadViewPost',
                post: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/current',
                  author: { handle: 'current.bsky.social' },
                  record: { text: 'Current message' }
                }
              }
            }
          });
        }
        
        const postNumber = uri.split('parent')[1] || '1';
        const nextNumber = parseInt(postNumber) + 1;
        
        return Promise.resolve({
          data: {
            thread: {
              $type: 'app.bsky.feed.defs#threadViewPost',
              post: {
                uri,
                author: { handle: `parent${postNumber}.bsky.social` },
                record: { text: `Parent ${postNumber} message` }
              },
              parent: nextNumber <= 20 ? {
                $type: 'app.bsky.feed.defs#threadViewPost',
                post: {
                  uri: `at://did:plc:test/app.bsky.feed.post/parent${nextNumber}`,
                  author: { handle: `parent${nextNumber}.bsky.social` },
                  record: { text: `Parent ${nextNumber} message` }
                }
              } : null
            }
          }
        });
      });

      (client as any).agent = mockAgent;

      // Test with maxDepth of 3
      const result = await client.getThreadHistory(mockNotification, 3);

      // Should have 3 messages total (2 parents + current)
      expect(result).toHaveLength(3);
      
      // Verify we didn't fetch more than requested (1 for thread + 1 for current post)
      expect(mockAgent.getPostThread).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors gracefully', async () => {
      const mockNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/current',
        cid: 'bafycurrent',
        author: 'current.bsky.social',
        text: 'Current message',
        createdAt: new Date(),
        reason: 'reply',
        replyInfo: {
          root: { uri: 'at://did:plc:test/app.bsky.feed.post/root', cid: 'bafyroot' },
          parent: { uri: 'at://did:plc:test/app.bsky.feed.post/parent1', cid: 'bafyparent1' }
        }
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };

      // Mock first call success, second call error
      (mockAgent.getPostThread as any)
        .mockResolvedValueOnce({
          data: {
            thread: {
              $type: 'app.bsky.feed.defs#threadViewPost',
              post: {
                uri: 'at://did:plc:test/app.bsky.feed.post/parent1',
                author: { handle: 'parent1.bsky.social' },
                record: { text: 'Parent 1 message' }
              },
              parent: {
                $type: 'app.bsky.feed.defs#threadViewPost',
                post: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/parent2',
                  author: { handle: 'parent2.bsky.social' },
                  record: { text: 'Parent 2 message' }
                }
              }
            }
          }
        })
        .mockRejectedValueOnce(new Error('API Error'));

      (client as any).agent = mockAgent;

      const result = await client.getThreadHistory(mockNotification, 10);

      // Should have 3 messages (2 parents + current) - error handling returns current message
      expect(result).toHaveLength(3);
      expect(result[0].author).toBe('parent2.bsky.social');
      expect(result[1].author).toBe('parent1.bsky.social');
      expect(result[2].author).toBe('current.bsky.social');
    });

    it('should reauthenticate when not authenticated', async () => {
      (client as any).authenticated = false;
      (client as any).tokenExpiresAt = new Date(Date.now() - 10 * 60 * 1000);

      const mockNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/test',
        cid: 'bafytest',
        author: 'test.bsky.social',
        text: 'Test message',
        createdAt: new Date(),
        reason: 'mention',
      };

      const mockGetPostThread: any = jest.fn();
      mockGetPostThread.mockRejectedValue(new Error('API Error') as any);

      const mockAgent = {
        getPostThread: mockGetPostThread,
      };

      (client as any).agent = mockAgent;

      const result = await client.getThreadHistory(mockNotification, 10);

      expect(authenticateSpy).toHaveBeenCalled();
      expect(result).toEqual([
        {
          author: 'test.bsky.social',
          text: 'Test message',
        },
      ]);
    });
  });
});
