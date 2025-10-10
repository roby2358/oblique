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
  getAuthorPosts(handle: string, limit?: number): Promise<BlueskyMessage[]>;
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
        reply: post.replyTo,
      });

      return {
        uri: response.uri,
        cid: response.cid,
      };
    },

    async getAuthorPosts(handle: string, limit: number = 10): Promise<BlueskyMessage[]> {
      if (!authenticated) {
        throw new Error('Not authenticated. Call authenticate() first.');
      }

      const response = await agent.getAuthorFeed({
        actor: handle,
        limit,
      });

      return response.data.feed.map((item: any) => ({
        uri: item.post.uri,
        cid: item.post.cid,
        author: item.post.author.handle,
        text: item.post.record.text,
        createdAt: new Date(item.post.record.createdAt),
      }));
    },

    isConfigured(): boolean {
      return !!config.handle && !!config.appPassword;
    },

    isAuthenticated(): boolean {
      return authenticated;
    },
  };
};

