// Bluesky API client
import { BskyAgent } from '@atproto/api';
import { XRPCError } from '@atproto/xrpc';
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
  private tokenExpiresAt: Date | null = null;
  // Re-authenticate 5 minutes before expiration to be safe
  private readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(private config: BlueskyConfig) {
    this.agent = new BskyAgent({ service: 'https://bsky.social' });
  }

  /**
   * Checks if an error is a NotFoundError (post deleted or not found).
   * This is a common, expected occurrence and should be handled gracefully.
   */
  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return (
      error.name === 'NotFoundError' || 
      error.message.includes('Post not found') ||
      error.message.includes('not found')
    );
  }

  /**
   * Messages errors gracefully, logging NotFoundError as debug and other errors as warnings.
   * @param error - The error to message
   * @param contextUri - The URI or identifier that was being accessed
   * @param contextType - The type of context (e.g., "Post", "Quoted post", "Thread post")
   * @param warningMessage - The warning message to log for non-NotFound errors
   */
  private messageNotFoundError(error: unknown, contextUri: string, contextType: string, warningMessage: string): void {
    if (this.isNotFoundError(error)) {
      console.debug(`${contextType} not found (likely deleted): ${contextUri}`);
    } else {
      console.warn(warningMessage, error);
    }
  }

  /**
   * Returns a default token expiration (1 day from now).
   */
  private getDefaultTokenExpiration(reason: string): Date {
    const expiration = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    console.log(`${reason}, using 1-day default expiration:`, expiration);
    return expiration;
  }

  /**
   * Parses the expiration date from a JWT token.
   * Returns null if parsing fails or expiration is not present.
   */
  private parseJwtExpiration(accessJwt: string): Date | null {
    // Guard: JWT must have 3 parts (header.payload.signature)
    const parts = accessJwt.split('.');
    if (parts.length !== 3) {
      console.warn('Invalid JWT token, not 3 parts:');
      return null;
    }

    try {
      const payload = JSON.parse(atob(parts[1]));
      
      // Guard: expiration claim must exist
      if (!payload.exp) {
        console.warn('No expiration in JWT token:');
        return null;
      }

      // JWT exp is in seconds since epoch
      return new Date(payload.exp * 1000);
    } catch (error) {
      console.warn('Could not parse JWT expiration:', error);
      return null;
    }
  }

  /**
   * Extracts token expiration from the agent's session JWT.
   * Returns the expiration date if found, otherwise uses a 1-day default.
   */
  private extractTokenExpiration(): Date {
    // Guard: no session available
    if (!this.agent.session) {
      return this.getDefaultTokenExpiration('No session data available');
    }

    const session = this.agent.session as any;
    const accessJwt = session.accessJwt;

    // Guard: no access JWT in session
    if (!accessJwt) {
      return this.getDefaultTokenExpiration('No accessJwt in session');
    }

    // Try to parse JWT expiration
    const expiration = this.parseJwtExpiration(accessJwt);
    if (expiration) {
      console.log('Token expiration set to:', expiration);
      return expiration;
    }

    // Fallback to default
    return this.getDefaultTokenExpiration('No expiration in token');
  }

  async authenticate(): Promise<void> {
    // clean the slate
    this.authenticated = false;
    this.tokenExpiresAt = null;

    await this.agent.login({
      identifier: this.config.handle,
      password: this.config.appPassword,
    });

    // TODO: should check for status
    this.authenticated = true;

    // Extract expiration from session data
    this.tokenExpiresAt = this.extractTokenExpiration();
  }

  /**
   * Checks if the token is expired or about to expire.
   * Returns true if token is valid, false if it needs refresh.
   */
  private isTokenExpired(now: Date = new Date()): boolean {
    if (!this.tokenExpiresAt) {
      // No expiration info means we should re-authenticate
      return true;
    }
    
    const bufferTime = new Date(now.getTime() + this.TOKEN_REFRESH_BUFFER_MS);
    
    return this.tokenExpiresAt <= bufferTime;
  }

  /**
   * Ensures authentication is valid. Re-authenticates if token is expired or about to expire.
   * Should be called before any API operation.
   */
  async ensureAuth(): Promise<void> {
    if (!this.authenticated || this.isTokenExpired()) {
      console.log('Re-authenticating due to expired or missing token');
      await this.authenticate();
    }
  }

  async like(postUri: string): Promise<{ uri: string; cid: string }> {
    await this.ensureAuth();

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
    await this.ensureAuth();

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

  async getNotifications(limit: number, unreadOnly: boolean): Promise<BlueskyMessage[]> {
    await this.ensureAuth();

    let response;
    try {
      response = await this.agent.api.app.bsky.notification.listNotifications({
        limit,
      });
    } catch (error) {
      if (error instanceof XRPCError) {
        console.error('Bluesky notifications request failed', {
          status: error?.status,
          code: error?.error,
          message: error?.message,
          headers: error?.headers,
        });
      } else {
        console.error('Unexpected Bluesky notifications error', error);
      }
      throw error;
    }

    // Filter for notifications that have associated posts (mentions, replies, quotes, likes, reposts)
    let notifications = response.data.notifications;

    console.log('Notifications:', notifications.length);

    if (false) {
      notifications = notifications.filter((notif: any) => notif.record?.text);
    }

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
    await this.ensureAuth();

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
   * Fetches a single post by URI with minimal thread data.
   * Returns the thread response from the Bluesky API.
   */
  async getSinglePost(uri: string): Promise<any> {
    await this.ensureAuth();
    
    return await this.agent.getPostThread({ 
      uri, 
      depth: 1,  // Only get direct replies, not nested ones
      parentHeight: 0  // Don't fetch parent posts
    });
  }

  /**
   * Checks if anyone has already replied to the specific post mentioned in a notification.
   * This is used to see if someone beat Oblique to replying to that particular post.
   * Returns true if there are replies to that specific post, false otherwise.
   */
  async hasRepliesToPost(message: BlueskyMessage): Promise<boolean> {
    try {
      // Get minimal thread data (depth=1) to check for direct replies only
      // This fetches just the post and its direct replies, not the full conversation
      const response = await this.getSinglePost(message.uri);
      
      if (!response.data.thread || (response.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
        return false;
      }
      
      const thread = response.data.thread as any;
      
      // Check if there are any direct replies to this specific post
      // The replies array contains direct replies to this post
      return !!(thread.replies && thread.replies.length > 0);
    } catch (error) {
      // Handle deleted/missing posts gracefully - this is a normal occurrence
      this.messageNotFoundError(error, message.uri, 'Post', 'Error checking for replies to post:');
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
    await this.ensureAuth();

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
      // Handle deleted/missing posts gracefully
      this.messageNotFoundError(error, notification.uri, 'Quoted post', 'Error fetching quoted post content:');
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
          // Handle deleted/missing quoted posts gracefully
          this.messageNotFoundError(quoteError, quotedPostUri, 'Quoted post', 'Error fetching quoted post:');
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
      // Handle deleted/missing posts gracefully
      this.messageNotFoundError(error, message.uri, 'Post', 'Error fetching current post data:');
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
    await this.ensureAuth();
    
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
        // Handle deleted/missing posts gracefully
        this.messageNotFoundError(error, message.uri, 'Current post', 'Error fetching current post data:');
        thread.push(basicFallback[0]);
      }
      
      return thread;
      
    } catch (error) {
      // Handle deleted/missing posts gracefully
      const parentUri = message.replyInfo?.parent?.uri || 'unknown';
      this.messageNotFoundError(error, parentUri, 'Thread post', 'Error fetching thread:');
      return basicFallback;
    }
  }
}

