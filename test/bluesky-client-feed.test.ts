import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BlueskyClient, FOLLOWING_FEED } from '../src/hooks/bluesky/bluesky-client.js';

// R-58: a look reads the feed its account names — the account's own timeline, or a generator
describe('BlueskyClient getFeed', () => {
  const FOR_YOU = 'at://did:plc:3guzzweuqraryl3rdkimjamk/app.bsky.feed.generator/for-you';

  const configFor = (lexicon: string, feed: string) => ({
    handle: 'oblique.test',
    appPassword: 'test-password',
    service: 'https://bsky.social',
    appview: 'did:web:api.bsky.app#bsky_appview',
    lexicon,
    feed,
  });

  let call: any;
  let log: any;

  const clientFor = (config: any) => {
    const client = new BlueskyClient(config);
    (client as any).agent = { api: { xrpc: { call } } };
    (client as any).authenticated = true;
    (client as any).tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    // already signed in, and the lexicon already registered: neither is what this asserts
    (client as any).lexiconRegistered = true;
    return client;
  };

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    call = jest.fn();
    call.mockResolvedValue({ data: { feed: [] } } as any);
  });

  afterEach(() => {
    log.mockRestore();
  });

  it('reads the account\'s own timeline when the feed is following', async () => {
    await clientFor(configFor('app.bsky', FOLLOWING_FEED)).getFeed(50);

    expect(call).toHaveBeenCalledWith('app.bsky.feed.getTimeline', { limit: 50 });
  });

  it('reads the generator the feed names otherwise', async () => {
    await clientFor(configFor('app.bsky', FOR_YOU)).getFeed(50);

    expect(call).toHaveBeenCalledWith('app.bsky.feed.getFeed', { feed: FOR_YOU, limit: 50 });
  });

  it('reads in the account\'s own lexicon', async () => {
    await clientFor(configFor('town.delve', FOLLOWING_FEED)).getFeed(50);

    expect(call).toHaveBeenCalledWith('town.delve.feed.getTimeline', { limit: 50 });
  });

  it('maps a generator\'s posts exactly as it maps the timeline\'s', async () => {
    call.mockResolvedValue({
      data: {
        feed: [{
          post: {
            uri: 'at://did:plc:a/app.bsky.feed.post/1',
            cid: 'cid-1',
            author: { handle: 'stranger.bsky.social' },
            record: { text: 'a post from nobody we follow' },
            indexedAt: '2026-10-28T00:00:00.000Z',
            replyCount: 0,
          },
        }],
      },
    } as any);

    const [candidate] = await clientFor(configFor('app.bsky', FOR_YOU)).getFeed(50);

    expect(candidate.message.author).toBe('stranger.bsky.social');
    expect(candidate.isRepost).toBe(false);
    expect(candidate.isReply).toBe(false);
  });
});
