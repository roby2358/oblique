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
    reason: 'mention',
  };

  beforeEach(() => {
    client = new BlueskyClient(mockConfig);
    // Mock the authenticate method to avoid actual API calls
    jest.spyOn(client, 'authenticate').mockResolvedValue();
    // Set authenticated to true for testing
    (client as any).authenticated = true;
  });

  describe('getQuotedHistory', () => {
    it('should return quoted post content when post exists', async () => {
      const quoteNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/quoted123',
        cid: 'bafyquote123',
        author: 'quoter.bsky.social',
        text: 'test quote post',
        createdAt: new Date(),
        reason: 'quote',
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };
      
      // Mock the first call to get the quote post
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'quoter.bsky.social' },
              record: { text: '@oblique.yuwakisa.com test' },
              embed: {
                record: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/original123'
                }
              }
            }
          }
        }
      });
      
      // Mock the second call to get the actual quoted post
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'quotedauthor.bsky.social' },
              record: { text: 'This is the quoted post content' }
            }
          }
        }
      });
      
      (client as any).agent = mockAgent;

      const result = await client.getQuotedHistory(quoteNotification);
      
      expect(result).toEqual([
        {
          author: 'quotedauthor.bsky.social',
          text: 'This is the quoted post content'
        },
        {
          author: 'quoter.bsky.social',
          text: 'test quote post'
        }
      ]);
      expect(mockAgent.getPostThread).toHaveBeenCalledTimes(2);
      expect(mockAgent.getPostThread).toHaveBeenNthCalledWith(1, { 
        uri: quoteNotification.uri,
        depth: 0,
        parentHeight: 0
      });
      expect(mockAgent.getPostThread).toHaveBeenNthCalledWith(2, { 
        uri: 'at://did:plc:test/app.bsky.feed.post/original123',
        depth: 0,
        parentHeight: 0
      });
    });

    it('should return quoted post content with alt texts when images are present', async () => {
      const quoteNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/quoted123',
        cid: 'bafyquote123',
        author: 'quoter.bsky.social',
        text: 'test quote post',
        createdAt: new Date(),
        reason: 'quote',
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };
      
      // Mock the first call to get the quote post
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'quoter.bsky.social' },
              record: { text: '@oblique.yuwakisa.com test' },
              embed: {
                record: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/original123'
                }
              }
            }
          }
        }
      });
      
      // Mock the second call to get the actual quoted post with images
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'quotedauthor.bsky.social' },
              record: { 
                text: 'This is the quoted post content',
                embed: {
                  images: [
                    { alt: 'First image description' },
                    { alt: 'Second image description' }
                  ]
                }
              }
            }
          }
        }
      });
      (client as any).agent = mockAgent;

      const result = await client.getQuotedHistory(quoteNotification);
      
      expect(result).toEqual([
        {
          author: 'quotedauthor.bsky.social',
          text: 'This is the quoted post content',
          altTexts: ['First image description', 'Second image description']
        },
        {
          author: 'quoter.bsky.social',
          text: 'test quote post'
        }
      ]);
    });

    it('should fallback to notification content when post does not exist', async () => {
      const quoteNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/nonexistent',
        cid: 'bafynonexistent',
        author: 'quoter.bsky.social',
        text: 'test quote post',
        createdAt: new Date(),
        reason: 'quote',
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };
      (mockAgent.getPostThread as any).mockResolvedValue({
        data: {
          thread: null
        }
      });
      (client as any).agent = mockAgent;

      const result = await client.getQuotedHistory(quoteNotification);
      
      expect(result).toEqual([{
        author: 'quoter.bsky.social',
        text: 'test quote post'
      }]);
    });

    it('should fallback to notification content when API call fails', async () => {
      const quoteNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/error123',
        cid: 'bafyerror123',
        author: 'quoter.bsky.social',
        text: 'test quote post',
        createdAt: new Date(),
        reason: 'quote',
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };
      (mockAgent.getPostThread as any).mockRejectedValue(new Error('API Error'));
      (client as any).agent = mockAgent;

      const result = await client.getQuotedHistory(quoteNotification);
      
      expect(result).toEqual([{
        author: 'quoter.bsky.social',
        text: 'test quote post'
      }]);
    });

    it('should include alt texts from quote post in main message', async () => {
      const quoteNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/quote123',
        cid: 'bafyquote123',
        author: 'quoter.bsky.social',
        text: '@oblique.yuwakisa.com test',
        createdAt: new Date(),
        reason: 'quote',
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };
      
      // Mock the first call to get the quote post with images
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'quoter.bsky.social' },
              record: { 
                text: '@oblique.yuwakisa.com test',
                embed: {
                  images: [
                    { alt: 'Quote post image 1' },
                    { alt: 'Quote post image 2' }
                  ]
                }
              },
              embed: {
                record: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/original123'
                }
              }
            }
          }
        }
      });
      
      // Mock the second call to get the actual quoted post
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'oblique.yuwakisa.com' },
              record: {
                text: "It's the hero's journey, a dance with adversity, echoing echoes of Prometheus stealing fire.\n\nIn the crucible of challenge, one is forged anew, embodying the eternal cycle of struggle and rebirth.\n\nThe tale of triumph over trial is as ancient as time, yet ever personal."
              }
            }
          }
        }
      });
      (client as any).agent = mockAgent;

      const result = await client.getQuotedHistory(quoteNotification);
      
      expect(result).toEqual([
        {
          author: 'oblique.yuwakisa.com',
          text: "It's the hero's journey, a dance with adversity, echoing echoes of Prometheus stealing fire.\n\nIn the crucible of challenge, one is forged anew, embodying the eternal cycle of struggle and rebirth.\n\nThe tale of triumph over trial is as ancient as time, yet ever personal."
        },
        {
          author: 'quoter.bsky.social',
          text: '@oblique.yuwakisa.com test',
          altTexts: ['Quote post image 1', 'Quote post image 2']
        }
      ]);
    });

    it('should extract quoted content from quote post embed', async () => {
      const quoteNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/quote123',
        cid: 'bafyquote123',
        author: 'quoter.bsky.social',
        text: '@oblique.yuwakisa.com test',
        createdAt: new Date(),
        reason: 'quote',
      };

      const mockAgent = {
        getPostThread: jest.fn()
      };
      
      // Mock the first call to get the quote post
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'quoter.bsky.social' },
              record: { text: '@oblique.yuwakisa.com test' },
              embed: {
                record: {
                  uri: 'at://did:plc:test/app.bsky.feed.post/original123'
                }
              }
            }
          }
        }
      });
      
      // Mock the second call to get the actual quoted post
      (mockAgent.getPostThread as any).mockResolvedValueOnce({
        data: {
          thread: {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: {
              author: { handle: 'oblique.yuwakisa.com' },
              record: {
                text: "It's the hero's journey, a dance with adversity, echoing echoes of Prometheus stealing fire.\n\nIn the crucible of challenge, one is forged anew, embodying the eternal cycle of struggle and rebirth.\n\nThe tale of triumph over trial is as ancient as time, yet ever personal."
              }
            }
          }
        }
      });
      (client as any).agent = mockAgent;

      const result = await client.getQuotedHistory(quoteNotification);
      
      expect(result).toEqual([
        {
          author: 'oblique.yuwakisa.com',
          text: "It's the hero's journey, a dance with adversity, echoing echoes of Prometheus stealing fire.\n\nIn the crucible of challenge, one is forged anew, embodying the eternal cycle of struggle and rebirth.\n\nThe tale of triumph over trial is as ancient as time, yet ever personal."
        },
        {
          author: 'quoter.bsky.social',
          text: '@oblique.yuwakisa.com test'
        }
      ]);
    });

    it('should throw error when not authenticated', async () => {
      const quoteNotification: BlueskyMessage = {
        uri: 'at://did:plc:test/app.bsky.feed.post/test123',
        cid: 'bafytest123',
        author: 'quoter.bsky.social',
        text: 'test quote post',
        createdAt: new Date(),
        reason: 'quote',
      };

      (client as any).authenticated = false;

      await expect(client.getQuotedHistory(quoteNotification)).rejects.toThrow(
        'Not authenticated. Call authenticate() first.'
      );
    });
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
