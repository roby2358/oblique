import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BlueskyClient } from '../src/hooks/bluesky/bluesky-client.js';

// R-41: a reply is written into the account's own lexicon, never Bluesky's by default
describe('BlueskyClient post', () => {
  const configFor = (lexicon: string, service: string, appview: string) => ({
    handle: 'oblique.test',
    appPassword: 'test-password',
    service,
    appview,
    lexicon,
  });

  const bluesky = configFor('app.bsky', 'https://bsky.social', 'did:web:api.bsky.app#bsky_appview');
  const delvetown = configFor('town.delve', 'https://pds.delve.town', 'did:web:api.delve.town#bsky_appview');

  let createRecord: any;
  let log: any;

  const clientFor = (config: any) => {
    const client = new BlueskyClient(config);
    (client as any).agent = {
      api: { com: { atproto: { repo: { createRecord } } } },
    };
    // already signed in, and the lexicon already registered: neither is what this asserts
    (client as any).authenticated = true;
    (client as any).tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    (client as any).lexiconRegistered = true;
    return client;
  };

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    createRecord = jest.fn();
    createRecord.mockResolvedValue({
      data: { uri: 'at://did:plc:test/x/abc', cid: 'cid-1' },
    } as any);
  });

  afterEach(() => {
    log.mockRestore();
  });

  it('writes an app.bsky.feed.post for a Bluesky account', async () => {
    await clientFor(bluesky).post({ text: 'Hello' });

    const [args] = createRecord.mock.calls[0];
    expect(args.collection).toBe('app.bsky.feed.post');
    expect(args.record.$type).toBe('app.bsky.feed.post');
  });

  it('writes a town.delve.feed.post for a delve.town account', async () => {
    await clientFor(delvetown).post({ text: 'Hello' });

    const [args] = createRecord.mock.calls[0];
    // the silent failure this guards: an app.bsky record on delve.town is stored and
    // never shown, so a wrong collection looks like success
    expect(args.collection).toBe('town.delve.feed.post');
    expect(args.record.$type).toBe('town.delve.feed.post');
  });

  it('writes into the account\'s own repo, with the text and a createdAt', async () => {
    await clientFor(delvetown).post({ text: 'An oblique observation' });

    const [args] = createRecord.mock.calls[0];
    expect(args.repo).toBe('oblique.test');
    expect(args.record.text).toBe('An oblique observation');
    expect(Date.parse(args.record.createdAt)).not.toBeNaN();
  });

  it('carries the reply refs when the post is a reply', async () => {
    const replyTo = {
      root: { uri: 'at://did:plc:a/town.delve.feed.post/root', cid: 'cid-root' },
      parent: { uri: 'at://did:plc:a/town.delve.feed.post/parent', cid: 'cid-parent' },
    };

    await clientFor(delvetown).post({ text: 'A reply', replyTo });

    expect(createRecord.mock.calls[0][0].record.reply).toEqual(replyTo);
  });

  it('answers with the uri and cid Bluesky confirms, not the ones it was given', async () => {
    createRecord.mockResolvedValue({
      data: { uri: 'at://did:plc:test/town.delve.feed.post/3myabc', cid: 'cid-confirmed' },
    } as any);

    // createRecord answers { data: { uri, cid } }, where agent.post answered { uri, cid } —
    // reading the wrong level returns undefined and the chain reports a successful post
    await expect(clientFor(delvetown).post({ text: 'A reply' })).resolves.toEqual({
      uri: 'at://did:plc:test/town.delve.feed.post/3myabc',
      cid: 'cid-confirmed',
    });
  });
});
