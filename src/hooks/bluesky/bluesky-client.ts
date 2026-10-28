// Bluesky API client
import { BskyAgent } from '@atproto/api';
import { XRPCError } from '@atproto/xrpc';
import { registerLexicon } from './lexicon.js';
import type { BlueskyPost, BlueskyMessage } from '../../types/index.js';

/**
 * How long before a token's stated expiry to sign in again. Wide enough that no single call
 * can be cut off by a token that expires between the check and the response.
 */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * How long a token is assumed to last when its expiry cannot be read from the session JWT.
 *
 * Shorter than any real access token rather than longer, which is the whole point: a guess
 * that overshoots leaves the client certain of a token the PDS has already forgotten, and
 * every call after that fails until someone reloads the page. A guess that undershoots costs
 * one login. With `TOKEN_REFRESH_BUFFER_MS` taken off, this is one login per five minutes of
 * use, and only down a path where the JWT could not be read at all (D-26).
 */
export const TOKEN_DEFAULT_TTL = 10 * 60 * 1000;

/**
 * Whether the PDS refused a call because the token is no good. Read off the status rather
 * than tested with `instanceof`, because a duplicated copy of the SDK's error class would
 * make the retry silently stop happening — the exact kind of failure this check exists to
 * end. `ExpiredToken` is named as well, since it arrives on a 400 from some paths.
 */
export const isUnauthorizedError = (error: unknown): boolean => {
  const refusal = error as { status?: number; error?: string } | null;

  return refusal?.status === 401 || refusal?.error === 'ExpiredToken';
};

export interface BlueskyConfig {
  handle: string;
  appPassword: string;
  /**
   * The PDS that hosts this account, e.g. `https://bsky.social` or `https://pds.delve.town`.
   * ATProto authenticates at the host, not at a central entryway: the credential is checked
   * against this PDS's own record of the account, so the wrong value here fails at login
   * (R-38).
   */
  service: string;
  /**
   * The AppView that answers this account's reads, as an `atproto-proxy` header value:
   * `<did>#<service id>`. The PDS forwards the call there with a service-auth token. The
   * reference PDS forwards `app.bsky.*` to Bluesky's AppView by default, but that is a
   * convenience on its way out and no other PDS owes it, so the AppView is always named
   * (D-23).
   */
  appview: string;
  /**
   * The NSID prefix of the lexicon this network speaks — `app.bsky` for Bluesky,
   * `town.delve` for delve.town. Every method and record type is built from it.
   */
  lexicon: string;
  /**
   * The feed a look reads: `FOLLOWING_FEED` for the account's own timeline, or the at-URI of a
   * feed generator, such as Bluesky's "For You". A generator lives on one network, so each
   * account names its own (D-31).
   */
  feed: string;
}

/** The `feed` that names the account's own timeline — the posts of the accounts it follows. */
export const FOLLOWING_FEED = 'following';

export interface BlueskyHistoryEntry {
  author: string;
  text: string;
  altTexts?: string[];
}

/**
 * The `reason` a post carries when nothing asked for it: it was in the feed, not in the
 * notifications. The reply chain treats it exactly like a notification — which is the point of
 * shaping it as one — and this marks where it came from, for the chain's work and for anyone
 * reading the observer panel (D-28).
 */
export const FEED_REASON = 'feed';

/**
 * A post from the account's own timeline, with the three facts the feed gate judges it on that
 * a `BlueskyMessage` has no room for. All three arrive with the post, so qualifying a whole
 * timeline costs no further requests (D-28).
 */
export interface FeedCandidate {
  message: BlueskyMessage;
  /** How many replies the post already has, as the AppView counts them. */
  replyCount: number;
  /** Whether the post is itself a reply, rather than the top of a thread. */
  isReply: boolean;
  /** Whether it is in the timeline because someone reposted it, rather than wrote it. */
  isRepost: boolean;
}

export class BlueskyClient {
  private agent: BskyAgent;
  private authenticated = false;
  private tokenExpiresAt: Date | null = null;

  private lexiconRegistered = false;

  constructor(private config: BlueskyConfig) {
    this.agent = new BskyAgent({ service: config.service });
    // Service proxying is an HTTP header, and the SDK's own `withProxy` predates it: its
    // types admit `atproto_labeler` and nothing else. The header is set directly instead.
    this.agent.api.xrpc.setHeader('atproto-proxy', config.appview);
  }

  /** This network's name for a method or record type, e.g. `town.delve.feed.post`. */
  private nsid(suffix: string): string {
    return `${this.config.lexicon}.${suffix}`;
  }

  /**
   * Whether a `getPostThread` node is a readable post. The thread union is namespaced, so the
   * prefix differs per network and only the fragment after `#` is the same everywhere.
   */
  private isThreadViewPost(node: any): boolean {
    return node?.$type === this.nsid('feed.defs#threadViewPost');
  }

  /**
   * This network's `feed.getPostThread`. `agent.getPostThread` only ever asks Bluesky's, so
   * every thread read goes through here and the NSID is built once (D-23).
   */
  private getPostThread(params: { uri: string; depth: number; parentHeight: number }): Promise<any> {
    const method = this.nsid('feed.getPostThread');

    return this.request(method, () => this.agent.api.xrpc.call(method, params));
  }

  /**
   * Teach the agent this network's lexicon, once, before anything that needs it. The SDK
   * refuses an NSID it does not know before the request leaves the page, and it only ships
   * Bluesky's (D-23).
   */
  private async ensureLexicon(): Promise<void> {
    if (this.lexiconRegistered) {
      return;
    }

    await registerLexicon(this.agent, this.config.lexicon, this.config.service);
    this.lexiconRegistered = true;
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
   * The expiry to assume when the session JWT does not give one: deliberately sooner than a
   * real token's, so a bad guess costs logins rather than silence (D-26).
   */
  private getDefaultTokenExpiration(reason: string): Date {
    const expiration = new Date(Date.now() + TOKEN_DEFAULT_TTL);
    console.warn(`${reason}, assuming the token expires at:`, expiration);
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
   * Returns the expiration date if found, otherwise `TOKEN_DEFAULT_TTL` from now.
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

    console.log(`Signing in as ${this.config.handle} at ${this.config.service}`);

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
    
    const bufferTime = new Date(now.getTime() + TOKEN_REFRESH_BUFFER_MS);
    
    return this.tokenExpiresAt <= bufferTime;
  }

  /**
   * Ensures authentication is valid. Re-authenticates if token is expired or about to expire.
   * Should be called before any API operation.
   */
  async ensureAuth(): Promise<void> {
    await this.ensureLexicon();

    if (!this.authenticated || this.isTokenExpired()) {
      console.log('Re-authenticating due to expired or missing token');
      await this.authenticate();
    }
  }

  /**
   * Make one request, with authentication on both sides of it: the pre-emptive refresh
   * before, and one re-authenticate-and-retry if the PDS refuses the token anyway (D-26).
   *
   * Every request this client makes goes through here, so neither half can be forgotten by
   * a method added later. The retry is once only: a second refusal is the PDS's answer and
   * not a stale token, so it belongs where the caller can see it.
   *
   * @param method - The NSID or method name, for the log line
   * @param call - The request to make; called again, unchanged, after a re-authentication
   */
  private async request<T>(method: string, call: () => Promise<T>): Promise<T> {
    await this.ensureAuth();

    try {
      return await call();
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        throw error;
      }

      console.warn(`${method} was refused as unauthorized; signing in again and retrying once`);
      await this.authenticate();

      return await call();
    }
  }

  async like(postUri: string): Promise<{ uri: string; cid: string }> {
    // First, fetch the post to get its CID
    let postCid = '';
    try {
      const postResponse = await this.request('com.atproto.repo.getRecord', () =>
        this.agent.api.com.atproto.repo.getRecord({
          repo: postUri.split('/')[2], // Extract repo from URI (e.g., did:plc:...)
          collection: this.nsid('feed.post'),
          rkey: postUri.split('/')[4], // Extract record key from URI
        })
      );
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

    console.log(`Liking post as ${this.config.handle}:`, JSON.stringify(likeData, null, 2));

    // Use the AT Protocol createRecord method directly
    const response = await this.request('com.atproto.repo.createRecord', () =>
      this.agent.api.com.atproto.repo.createRecord({
        repo: this.config.handle,
        collection: this.nsid('feed.like'),
        record: likeData,
      })
    );

    console.log('Like response:', { uri: response.data.uri, cid: response.data.cid });

    return {
      uri: response.data.uri,
      cid: response.data.cid,
    };
  }

  async post(post: BlueskyPost): Promise<{ uri: string; cid: string }> {
    const postData = {
      $type: this.nsid('feed.post'),
      text: post.text,
      reply: post.replyTo,
      createdAt: new Date().toISOString(),
    };

    console.log(`Posting as ${this.config.handle}:`, JSON.stringify(postData, null, 2));

    // `agent.post` writes an `app.bsky.feed.post` and nothing else, so the record is written
    // directly and the collection comes from this network's lexicon
    const response = await this.request('com.atproto.repo.createRecord', () =>
      this.agent.api.com.atproto.repo.createRecord({
        repo: this.config.handle,
        collection: this.nsid('feed.post'),
        record: postData,
      })
    );

    console.log('Post response:', { uri: response.data.uri, cid: response.data.cid });

    return {
      uri: response.data.uri,
      cid: response.data.cid,
    };
  }

  logNotification = (notif: any) => {
    console.log('Raw notification:', JSON.stringify(notif, null, 2));
  }

  async getNotifications(limit: number, unreadOnly: boolean): Promise<BlueskyMessage[]> {
    const method = this.nsid('notification.listNotifications');

    let response;
    try {
      response = await this.request(method, () => this.agent.api.xrpc.call(method, { limit }));
    } catch (error) {
      if (error instanceof XRPCError) {
        console.error(`Notifications request failed for ${this.config.handle}`, {
          status: error?.status,
          code: error?.error,
          message: error?.message,
          headers: error?.headers,
        });
      } else {
        console.error(`Unexpected notifications error for ${this.config.handle}`, error);
      }
      throw error;
    }

    // Filter for notifications that have associated posts (mentions, replies, quotes, likes, reposts)
    let notifications = response.data.notifications;

    console.log(`Notifications for ${this.config.handle}:`, notifications.length);

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

  /**
   * The feed this account reads when it goes looking: its own timeline, or the feed generator
   * its config names.
   *
   * This is where the bot's taste is configured, and it is deliberately not configured here —
   * who the account follows, and what a generator learns from its likes, are knobs turned
   * outside this repository (D-28, D-31).
   *
   * Every item is mapped to the shape a notification arrives in, so the reply chain needs no
   * case for a post nobody asked it to answer.
   */
  async getFeed(limit: number): Promise<FeedCandidate[]> {
    const following = this.config.feed === FOLLOWING_FEED;
    const method = this.nsid(following ? 'feed.getTimeline' : 'feed.getFeed');
    const params = following ? { limit } : { feed: this.config.feed, limit };

    const response = await this.request(method, () => this.agent.api.xrpc.call(method, params));
    const feed = response.data.feed || [];

    console.log(`Feed ${this.config.feed} for ${this.config.handle}:`, feed.length);

    return feed.map((item: any) => this.toFeedCandidate(item));
  }

  /**
   * One timeline item as a candidate. `item.reason` is present when the item is in the feed
   * because someone reposted it; only its presence is read, so the namespaced type each
   * network gives it never has to be named (D-23).
   */
  private toFeedCandidate(item: any): FeedCandidate {
    const post = item.post;
    const reply = post.record?.reply;

    return {
      message: {
        uri: post.uri,
        cid: post.cid,
        author: post.author.handle,
        text: post.record?.text || '',
        createdAt: new Date(post.indexedAt),
        reason: FEED_REASON,
        replyInfo: reply ? { root: reply.root, parent: reply.parent } : undefined,
      },
      replyCount: post.replyCount || 0,
      isReply: !!reply,
      isRepost: !!item.reason,
    };
  }

  async markNotificationsAsSeen(): Promise<void> {
    const method = this.nsid('notification.updateSeen');

    await this.request(method, () =>
      this.agent.api.xrpc.call(
        method,
        {},
        { seenAt: new Date().toISOString() },
        { encoding: 'application/json' }
      )
    );
  }

  isConfigured(): boolean {
    return !!this.config.handle && !!this.config.appPassword && !!this.config.service
      && !!this.config.appview && !!this.config.lexicon;
  }

  /** The PDS this client signs in to and posts through. */
  serviceUrl(): string {
    return this.config.service;
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
    return await this.getPostThread({
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
      
      if (!response.data.thread || !this.isThreadViewPost(response.data.thread)) {
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
    if (!node || !this.isThreadViewPost(node)) {
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
    // Fallback to the notification's own content when quote post cannot be fetched
    const fallback = [{
      author: notification.author,
      text: notification.text,
    }];

    try {
      console.log('Getting quoted history for notification:', notification);

      // First, get the quote post to find the quoted post's URI
      const quotePostResponse = await this.getPostThread({ 
        uri: notification.uri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      console.log('Quote post response:', quotePostResponse);

      if (!quotePostResponse.data.thread || !this.isThreadViewPost(quotePostResponse.data.thread)) {
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
      const quotedPostResponse = await this.getPostThread({ 
        uri: quotedPostUri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      console.log('Quoted post response:', quotedPostResponse);
      
      if (!quotedPostResponse.data.thread || !this.isThreadViewPost(quotedPostResponse.data.thread)) {
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
      const currentPostResponse = await this.getPostThread({ 
        uri: message.uri,
        depth: 0,  // Only get the post itself, not its replies
        parentHeight: 0  // Don't fetch parent posts
      });
      
      if (!currentPostResponse.data.thread || !this.isThreadViewPost(currentPostResponse.data.thread)) {
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
          const quotedPostResponse = await this.getPostThread({ 
            uri: quotedPostUri,
            depth: 0,  // Only get the post itself, not its replies
            parentHeight: 0  // Don't fetch parent posts
          });
          
          if (quotedPostResponse.data.thread && this.isThreadViewPost(quotedPostResponse.data.thread)) {
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
      const response = await this.getPostThread({ 
        uri: message.replyInfo.parent.uri,
        depth: 0,  // We only need the post itself, not its replies
        parentHeight: maxDepth  // Fetch up to maxDepth parent posts
      });
      
      if (!response.data.thread || !this.isThreadViewPost(response.data.thread)) {
        return basicFallback;
      }
      
      // Extract all posts from the thread (this will be in oldest-to-newest order)
      const thread = this.extractPostsFromThread(response.data.thread);
      
      // Add the current message at the end (newest)
      // We need to fetch the full post data to get alt texts
      try {
        const currentPostResponse = await this.getPostThread({ 
          uri: message.uri,
          depth: 0,  // Only get the post itself, not its replies
          parentHeight: 0  // Don't fetch parent posts
        });
        
        if (!currentPostResponse.data.thread || !this.isThreadViewPost(currentPostResponse.data.thread)) {
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

