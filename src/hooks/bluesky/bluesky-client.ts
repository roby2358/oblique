// Bluesky API client
import { BskyAgent } from '@atproto/api';
import type { BlueskyPost, BlueskyMessage } from '../../types/index.js';

export interface BlueskyConfig {
  handle: string;
  appPassword: string;
}

export class BlueskyClient {
  private agent: BskyAgent;
  private authenticated = false;

  constructor(private config: BlueskyConfig) {
    this.agent = new BskyAgent({ service: 'https://bsky.social' });
  }

  async authenticate(): Promise<void> {
    await this.agent.login({
      identifier: this.config.handle,
      password: this.config.appPassword,
    });
    this.authenticated = true;
  }

  async like(postUri: string): Promise<{ uri: string; cid: string }> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // First, fetch the post to get its CID
    let postCid = '';
    try {
      const postResponse = await this.agent.api.com.atproto.repo.getRecord({
        repo: postUri.split('/')[2], // Extract repo from URI (e.g., did:plc:...)
        collection: 'app.bsky.feed.post',
        rkey: postUri.split('/')[4], // Extract record key from URI
      });
      postCid = postResponse.data.cid || '';
    } catch (error) {
      console.warn('Could not fetch post CID, proceeding with empty CID:', error);
      // Continue with empty CID - some AT Protocol implementations allow this
    }

    const likeData = {
      subject: {
        uri: postUri,
        cid: postCid,
      },
      createdAt: new Date().toISOString(),
    };

    console.log('Liking post on Bluesky:', JSON.stringify(likeData, null, 2));

    // Use the AT Protocol createRecord method directly
    const response = await this.agent.api.com.atproto.repo.createRecord({
      repo: this.config.handle,
      collection: 'app.bsky.feed.like',
      record: likeData,
    });

    console.log('Like response:', { uri: response.data.uri, cid: response.data.cid });

    return {
      uri: response.data.uri,
      cid: response.data.cid,
    };
  }

  async post(post: BlueskyPost): Promise<{ uri: string; cid: string }> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const postData = {
      text: post.text,
      reply: post.replyTo,
    };

    console.log('Posting to Bluesky:', JSON.stringify(postData, null, 2));

    const response = await this.agent.post(postData);

    console.log('Post response:', { uri: response.uri, cid: response.cid });

    return {
      uri: response.uri,
      cid: response.cid,
    };
  }

  logNotification = (notif: any) => {
    console.log('Raw notification:', JSON.stringify(notif, null, 2));
  }

  async getNotifications(limit: number = 25, unreadOnly: boolean = true): Promise<BlueskyMessage[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const response = await this.agent.api.app.bsky.notification.listNotifications({ 
      limit
    });

    // Filter for notifications that have associated posts (mentions, replies, quotes, likes, reposts)
    let notifications = response.data.notifications
      .filter((notif: any) => notif.record?.text); // Only include notifications with text content

    // Filter for unread only if requested
    if (unreadOnly) {
      notifications = notifications.filter((notif: any) => !notif.isRead);
    }

    return notifications.map((notif: any) => {
      // Extract reply info if this is part of a thread
      let replyInfo;
      if (notif.record.reply) {
        replyInfo = {
          root: notif.record.reply.root,
          parent: notif.record.reply.parent,
        };
      }
      
      return {
        uri: notif.uri,
        cid: notif.cid,
        author: notif.author.handle,
        text: notif.record.text,
        createdAt: new Date(notif.indexedAt),
        reason: notif.reason,
        replyInfo,
      };
    });
  }

  async markNotificationsAsSeen(): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    await this.agent.updateSeenNotifications();
  }

  isConfigured(): boolean {
    return !!this.config.handle && !!this.config.appPassword;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Determines the appropriate reply threading info for a notification or mention.
   * If the message has replyInfo, use its root (to maintain thread continuity).
   * Otherwise, use the message itself as the root (starting a new thread).
   * The parent is always the message being replied to.
   */
  notificationReplyTo(message: BlueskyMessage): { root: { uri: string; cid: string }; parent: { uri: string; cid: string } } {
    const root = message.replyInfo?.root || {
      uri: message.uri,
      cid: message.cid,
    };
    
    const parent = {
      uri: message.uri,
      cid: message.cid,
    };

    return { root, parent };
  }

  /**
   * Checks if anyone has already replied to the specific post mentioned in a notification.
   * This is used to see if someone beat Oblique to replying to that particular post.
   * Returns true if there are replies to that specific post, false otherwise.
   */
  async hasRepliesToPost(message: BlueskyMessage): Promise<boolean> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    try {
      // Get minimal thread data (depth=1) to check for direct replies only
      // This fetches just the post and its direct replies, not the full conversation
      const response = await this.agent.getPostThread({ 
        uri: message.uri, 
        depth: 1,  // Only get direct replies, not nested ones
        parentHeight: 0  // Don't fetch parent posts
      });
      
      if (!response.data.thread || (response.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        return false;
      }
      
      const thread = response.data.thread as any;
      
      // Check if there are any direct replies to this specific post
      // The replies array contains direct replies to this post
      return !!(thread.replies && thread.replies.length > 0);
    } catch (error) {
      console.error('Error checking for replies to post:', error);
      return false;
    }
  }

  /**
   * Extracts the main post text from a post record.
   * Returns the text content of the post.
   */
  private getPostText(post: any): string | null {
    if (!post?.record?.text) {
      return null;
    }
    return post.record.text;
  }

  /**
   * Extracts quoted post text from a quote post embed.
   * Returns the quoted post's text and author, or null if not a quote post.
   */
  private getQuotedPostText(post: any): { author: string; text: string; altTexts?: string[] } | null {
    if (!post?.embed?.record?.value) {
      return null;
    }
    
    const quotedPost = post.embed.record.value;
    const quotedAuthor = post.embed.record.author?.handle;
    
    if (!quotedPost?.text || !quotedAuthor) {
      return null;
    }
    
    return {
      author: quotedAuthor,
      text: quotedPost.text,
      altTexts: undefined,
    };
  }

  /**
   * Extracts alt texts from images in a post record.
   * Returns an array of alt texts, or undefined if none found.
   */
  private getAltTexts(post: any): string[] | undefined {
    if (!post?.record?.embed?.images) {
      return undefined;
    }
    
    const altTexts: string[] = [];
    for (const image of post.record.embed.images) {
      if (image.alt) {
        altTexts.push(image.alt);
      }
    }
    
    return altTexts.length > 0 ? altTexts : undefined;
  }

  /**
   * Extracts post data from a thread node, including alt texts from images.
   * For quote posts, extracts the quoted content instead of the quote post's own text.
   * Returns the post's author, text, and alt texts (if any).
   */
  private extractPostData(threadNode: any): { author: string; text: string; altTexts?: string[] } | null {
    if (!threadNode || threadNode.$type !== 'app.bsky.feed.defs#threadViewPost') {
      return null;
    }
    
    const post = threadNode.post;
    if (!post || !post.record) {
      return null;
    }
    
    // Check if this is a quote post
    const quotedPost = this.getQuotedPostText(post);
    if (quotedPost) {
      return quotedPost;
    }
    
    // Regular post - extract normal content
    const postText = this.getPostText(post);
    const altTexts = this.getAltTexts(post);
    
    if (!postText) {
      return null;
    }
    
    return {
      author: post.author.handle,
      text: postText,
      altTexts,
    };
  }

  /**
   * Recursively extracts all posts from a thread structure.
   * Returns an array of posts in chronological order (oldest first).
   */
  private extractPostsFromThread(threadNode: any): Array<{ author: string; text: string; altTexts?: string[] }> {
    const postsInOrder: Array<{ author: string; text: string; altTexts?: string[] }> = [];
    
    const traverse = (node: any): void => {
      const postData = this.extractPostData(node);
      if (postData) {
        postsInOrder.push(postData);
      }
      
      // Recursively extract from parent
      if (node?.parent) {
        traverse(node.parent);
      }
    };
    
    traverse(threadNode);
    
    // Reverse to get oldest-to-newest order
    return postsInOrder.reverse();
  }

  /**
   * Fetches the content of a quoted post using its URI.
   * Returns an array with the quoted post's content as history and the quote post's text as the main message.
   * Falls back to the notification's own content if the quoted post cannot be fetched.
   */
  async getQuotedPostContent(notification: BlueskyMessage): Promise<Array<{ author: string; text: string; altTexts?: string[] }>> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    try {
      // First, get the quote post to find the quoted post's URI
      const quotePostResponse = await this.agent.getPostThread({ 
        uri: notification.uri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      if (!quotePostResponse.data.thread || (quotePostResponse.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        // Fallback to the notification's own content
        return [{
          author: notification.author,
          text: notification.text,
        }];
      }
      
      const quotePost = quotePostResponse.data.thread.post as any;
      
      // Check if this is actually a quote post and get the quoted post's URI
      if (!quotePost?.embed?.record?.uri) {
        // Not a quote post, fallback to the notification's own content
        return [{
          author: notification.author,
          text: notification.text,
        }];
      }
      
      const quotedPostUri = quotePost.embed.record.uri;
      
      // Now fetch the actual quoted post
      const quotedPostResponse = await this.agent.getPostThread({ 
        uri: quotedPostUri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      if (!quotedPostResponse.data.thread || (quotedPostResponse.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        // Fallback to the notification's own content
        return [{
          author: notification.author,
          text: notification.text,
        }];
      }
      
      const quotedPostData = this.extractPostData(quotedPostResponse.data.thread);
      if (quotedPostData) {
        // Extract alt texts from the quote post itself
        const quotePostAltTexts = this.getAltTexts(quotePost);
        
        // Return both the quoted content (as history) and the quote post's text (as main message)
        return [
          quotedPostData, // This becomes the thread history
          {
            author: notification.author,
            text: notification.text, // This becomes the main message to reply to
            altTexts: quotePostAltTexts, // Include alt texts from the quote post
          }
        ];
      } else {
        // Fallback to the notification's own content
        return [{
          author: notification.author,
          text: notification.text,
        }];
      }
    } catch (error) {
      console.error('Error fetching quoted post content:', error);
      // Fallback to the notification's own content
      return [{
        author: notification.author,
        text: notification.text,
      }];
    }
  }

  /**
   * Fetches the thread history for a message, going back up to maxDepth posts.
   * Returns an array of messages in chronological order (oldest first).
   */
  async getThreadHistory(message: BlueskyMessage, maxDepth: number): Promise<Array<{ author: string; text: string; altTexts?: string[] }>> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    
    console.log('Message:', message);


    // If this is a reply, get the thread from the parent post
    // If not a reply, just return the current message with alt texts
    if (!message.replyInfo?.parent?.uri) {
      try {
        const currentPostResponse = await this.agent.getPostThread({ 
          uri: message.uri,
          depth: 0,  // Only get the post itself, not its replies
          parentHeight: 0  // Don't fetch parent posts
        });
        
        if (currentPostResponse.data.thread && (currentPostResponse.data.thread as any).$type === 'app.bsky.feed.defs#threadViewPost') {
          const postData = this.extractPostData(currentPostResponse.data.thread);
          if (postData) {
            return [{
              author: message.author,
              text: message.text,
              altTexts: postData.altTexts,
            }];
          }
        }
        
        // Fallback to basic message without alt texts
        return [{
          author: message.author,
          text: message.text,
        }];
      } catch (error) {
        console.error('Error fetching current post data:', error);
        // Fallback to basic message without alt texts
        return [{
          author: message.author,
          text: message.text,
        }];
      }
    }

    try {
      const response = await this.agent.getPostThread({ 
        uri: message.replyInfo.parent.uri,
        depth: 0,  // We only need the post itself, not its replies
        parentHeight: maxDepth  // Fetch up to maxDepth parent posts
      });
      
      if (!response.data.thread || (response.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        return [{
          author: message.author,
          text: message.text,
        }];
      }
      
      // Extract all posts from the thread (this will be in oldest-to-newest order)
      const thread = this.extractPostsFromThread(response.data.thread);
      
      // Add the current message at the end (newest)
      // We need to fetch the full post data to get alt texts
      try {
        const currentPostResponse = await this.agent.getPostThread({ 
          uri: message.uri,
          depth: 0,  // Only get the post itself, not its replies
          parentHeight: 0  // Don't fetch parent posts
        });
        
        if (currentPostResponse.data.thread && (currentPostResponse.data.thread as any).$type === 'app.bsky.feed.defs#threadViewPost') {
          const postData = this.extractPostData(currentPostResponse.data.thread);
          if (postData) {
            // Use the extracted post data but override with the message's author and text
            thread.push({
              author: message.author,
              text: message.text,
              altTexts: postData.altTexts,
            });
          } else {
            // Fallback to basic message without alt texts
            thread.push({
              author: message.author,
              text: message.text,
            });
          }
        } else {
          // Fallback to basic message without alt texts
          thread.push({
            author: message.author,
            text: message.text,
          });
        }
      } catch (error) {
        console.error('Error fetching current post data:', error);
        // Fallback to basic message without alt texts
        thread.push({
          author: message.author,
          text: message.text,
        });
      }
      
      return thread;
      
    } catch (error) {
      console.error('Error fetching thread:', error);
      // Return just the current message on error
      return [{
        author: message.author,
        text: message.text,
      }];
    }
  }
}

