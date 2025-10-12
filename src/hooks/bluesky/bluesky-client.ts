// Bluesky API client
import { BskyAgent } from '@atproto/api';
import type { BlueskyPost, BlueskyMessage } from '../../types/index.js';

export interface BlueskyConfig {
  handle: string;
  appPassword: string;
}

export interface BlueskyClient {
  authenticate(): Promise<void>;
  post(post: BlueskyPost): Promise<{ uri: string; cid: string }>;
  getNotifications(limit?: number, unreadOnly?: boolean): Promise<BlueskyMessage[]>;
  markNotificationsAsSeen(): Promise<void>;
  isConfigured(): boolean;
  isAuthenticated(): boolean;
}

export const createBlueskyClient = (config: BlueskyConfig): BlueskyClient => {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  let authenticated = false;

  return {
    async authenticate(): Promise<void> {
      await agent.login({
        identifier: config.handle,
        password: config.appPassword,
      });
      authenticated = true;
    },

    async post(post: BlueskyPost): Promise<{ uri: string; cid: string }> {
      if (!authenticated) {
        throw new Error('Not authenticated. Call authenticate() first.');
      }

      const response = await agent.post({
        text: post.text,
        reply: post.replyTo ? {
          root: post.replyTo,
          parent: post.replyTo,
        } : undefined,
      });

      return {
        uri: response.uri,
        cid: response.cid,
      };
    },

    async getNotifications(limit: number = 25, unreadOnly: boolean = true): Promise<BlueskyMessage[]> {
      if (!authenticated) {
        throw new Error('Not authenticated. Call authenticate() first.');
      }

      const response = await agent.listNotifications({ limit });

      // Filter for notifications that have associated posts (mentions, replies, quotes, likes, reposts)
      let notifications = response.data.notifications
        .filter((notif: any) => notif.record?.text); // Only include notifications with text content

      // Filter for unread only if requested
      if (unreadOnly) {
        notifications = notifications.filter((notif: any) => !notif.isRead);
      }

      return notifications.map((notif: any) => ({
        uri: notif.uri,
        cid: notif.cid,
        author: notif.author.handle,
        text: notif.record.text,
        createdAt: new Date(notif.indexedAt),
      }));
    },

    async markNotificationsAsSeen(): Promise<void> {
      if (!authenticated) {
        throw new Error('Not authenticated. Call authenticate() first.');
      }

      await agent.updateSeenNotifications();
    },

    isConfigured(): boolean {
      return !!config.handle && !!config.appPassword;
    },

    isAuthenticated(): boolean {
      return authenticated;
    },
  };
};

