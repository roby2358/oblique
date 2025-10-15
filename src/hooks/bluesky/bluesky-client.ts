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

    const response = await this.agent.listNotifications({ limit });

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
   * Fetches the thread history for a message, going back up to maxDepth posts.
   * Returns an array of messages in chronological order (oldest first).
   */
  async getThreadHistory(message: BlueskyMessage, maxDepth: number = 5): Promise<Array<{ author: string; text: string; altTexts?: string[] }>> {
    if (!this.authenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const thread: Array<{ author: string; text: string; altTexts?: string[] }> = [];
    let currentUri = message.replyInfo?.parent?.uri;
    
    // Walk back through the thread up to maxDepth posts
    for (let i = 0; i < maxDepth && currentUri; i++) {
      try {
        const response = await this.agent.getPostThread({ 
          uri: currentUri,
          depth: 0,  // We only need the post itself, not its replies
          parentHeight: 0  // We only need this specific post, not its parents
        });
        
        if (!response.data.thread || (response.data.thread as any).$type !== 'app.bsky.feed.defs#threadViewPost') {
          break;
        }
        
        const post = response.data.thread as any;
        
        // Extract alt text from images if present
        const altTexts: string[] = [];
        if (post.post.record.embed?.images) {
          for (const image of post.post.record.embed.images) {
            if (image.alt) {
              altTexts.push(image.alt);
            }
          }
        }
        
        thread.unshift({
          author: post.post.author.handle,
          text: post.post.record.text,
          altTexts: altTexts.length > 0 ? altTexts : undefined,
        });
        
        // Move to parent post if it exists
        if (post.parent && post.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
          currentUri = post.parent.post.uri;
        } else {
          currentUri = undefined;
        }
      } catch (error) {
        console.error('Error fetching thread post:', error);
        break;
      }
    }
    
    // Add the current message at the end
    thread.push({
      author: message.author,
      text: message.text,
    });
    
    return thread;
  }
}

