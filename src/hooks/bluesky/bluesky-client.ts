// Bluesky API client
import { BskyAgent } from '@atproto/api';
import type { BlueskyPost, BlueskyMessage } from '../../types/index.js';

export interface BlueskyConfig {
  handle: string;
  appPassword: string;
}

export interface BlueskyHistoryEntry {
  author: string;
  text: string;
  altTexts?: string[];
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
   * Returns the post's author, text, and alt texts (if any).
   * For quote posts, the quoted content is treated as history/context, not as the main content.
   */
  private extractPostData(node: any): BlueskyHistoryEntry | null {
    if (!node || node.$type !== 'app.bsky.feed.defs#threadViewPost') {
      return null;
    }
    
    const post = node.post;
    if (!post || !post.record) {
      return null;
    }
    
    // Extract the actual post content (text + alt texts)
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
  private extractPostsFromThread(threadNode: any): BlueskyHistoryEntry[] {
    const postsInOrder: BlueskyHistoryEntry[] = [];
    
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
  async getQuotedHistory(notification: BlueskyMessage): Promise<BlueskyHistoryEntry[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // Fallback to the notification's own content when quote post cannot be fetched
    const fallback = [{
      author: notification.author,
      text: notification.text,
    }];

    try {
      console.log('Getting quoted history for notification:', notification);

      // First, get the quote post to find the quoted post's URI
      const quotePostResponse = await this.agent.getPostThread({ 
        uri: notification.uri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      console.log('Quote post response:', quotePostResponse);

      if (!quotePostResponse.data.thread || (quotePostResponse.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        return fallback;
      }
      
      const quotePost = quotePostResponse.data.thread.post as any;
      
      console.log('Quote post response:', quotePostResponse);

      // Check if this is actually a quote post and get the quoted post's URI
      if (!quotePost?.embed?.record?.uri) {
        return fallback;
      }
      
      const quotedPostUri = quotePost.embed.record.uri;
      
      // Now fetch the actual quoted post
      const quotedPostResponse = await this.agent.getPostThread({ 
        uri: quotedPostUri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      console.log('Quoted post response:', quotedPostResponse);
      
      if (!quotedPostResponse.data.thread || (quotedPostResponse.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        return fallback;
      }
      
      const quotedPostData = this.extractPostData(quotedPostResponse.data.thread);
      if (!quotedPostData) {
        return fallback;
      }
      
      // Extract alt texts from the quote post itself
      const quotePostAltTexts = this.getAltTexts(quotePost);
      
      // Return both the quoted content (as history) and the quote post's text (as main message)
      const history = [
        quotedPostData,
        {
          author: notification.author,
          text: notification.text,
          altTexts: quotePostAltTexts,
        }
      ];
      console.log('Quote Post History:', history);
      return history;
  } catch (error) {
      console.error('Error fetching quoted post content:', error);
      return fallback;
    }
  }

  /**
   * Fetches the history for a single post (non-reply messages).
   * Returns an array with the post data including alt texts from images.
   * If the post quotes another post, includes the quoted post's text as history.
   */
  private async getOnePostHistory(message: BlueskyMessage): Promise<BlueskyHistoryEntry[]> {
    const basicFallback = [{
      author: message.author,
      text: message.text,
    }];

    const history = [];    

    try {
      const currentPostResponse = await this.agent.getPostThread({ 
        uri: message.uri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      if (!currentPostResponse.data.thread || (currentPostResponse.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        return basicFallback;
      }
      
      const postData = this.extractPostData(currentPostResponse.data.thread);
      if (!postData) {
        return basicFallback;
      }
      
      const post = currentPostResponse.data.thread.post as any;
      
      // Check if this post quotes another post
      if (post?.embed?.record?.uri) {
        const quotedPostUri = post.embed.record.uri;
        
        try {
          // Fetch the quoted post
          const quotedPostResponse = await this.agent.getPostThread({ 
            uri: quotedPostUri,
            depth: 0,  // Only get the post itself, not its replies
            parentHeight: 0  // Don't fetch parent posts
          });
          
          if (quotedPostResponse.data.thread && (quotedPostResponse.data.thread as any).$type === 'app.bsky.feed.defs#threadViewPost') {
            const quotedPostData = this.extractPostData(quotedPostResponse.data.thread);
            if (quotedPostData) {
              // Add quoted post to history
              history.push(quotedPostData);
            }
          }
        } catch (quoteError) {
          console.error('Error fetching quoted post:', quoteError);
          // Continue with just the current post if quoted post fetch fails
        }
      }
      
      // Add current post to history
      history.push({
        author: message.author,
        text: message.text,
        altTexts: postData.altTexts,
      });
      
      return history;
    } catch (error) {
      console.error('Error fetching current post data:', error);
      return basicFallback;
    }
  }

  /**
   * Determines the type of history to fetch and builds a unified history list.
   * Returns an array of messages with the most recent post last.
   */
  getHistory(notification: BlueskyMessage): Promise<BlueskyHistoryEntry[]> {
    // Quote posts: history is the quoted post content
    if (notification.reason === 'quote') {
      return this.getQuotedHistory(notification);
    }
    
    // New posts (no reply info): just the single post
    if (!notification.replyInfo?.parent?.uri) {
      return this.getOnePostHistory(notification);
    }
    
    // Threaded posts: history is the thread
    return this.getThreadHistory(notification, 25);
  }

  /**
   * Fetches the thread history for a message, going back up to maxDepth posts.
   * Returns an array of messages in chronological order (oldest first).
   */
  async getThreadHistory(message: BlueskyMessage, maxDepth: number): Promise<BlueskyHistoryEntry[]> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    
    // Fallback to basic message without alt texts
    const basicFallback = [{
      author: message.author,
      text: message.text,
    }];
    
    console.log('Message:', message);

    // If this is a reply, get the thread from the parent post
    // If not a reply, just return the current message with alt texts
    if (!message.replyInfo?.parent?.uri) {
      return await this.getOnePostHistory(message);
    }

    try {
      const response = await this.agent.getPostThread({ 
        uri: message.replyInfo.parent.uri,
        depth: 0,  // We only need the post itself, not its replies
        parentHeight: maxDepth  // Fetch up to maxDepth parent posts
      });
      
      if (!response.data.thread || (response.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        return basicFallback;
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
        
        if (!currentPostResponse.data.thread || (currentPostResponse.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
          thread.push(basicFallback[0]);
          return thread;
        }
        
        const postData = this.extractPostData(currentPostResponse.data.thread);
        if (!postData) {
          thread.push(basicFallback[0]);
          return thread;
        }
        
        // Use the extracted post data but override with the message's author and text
        thread.push({
          author: message.author,
          text: message.text,
          altTexts: postData.altTexts,
        });
      } catch (error) {
        console.error('Error fetching current post data:', error);
        thread.push(basicFallback[0]);
      }
      
      return thread;
      
    } catch (error) {
      console.error('Error fetching thread:', error);
      return basicFallback;
    }
  }
}

