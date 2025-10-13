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
      console.log('Raw notification:', JSON.stringify(notif, null, 2));
      
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
}

