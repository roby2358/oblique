import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  isBundledLexicon,
  lexiconAuthority,
  registerLexicon,
} from '../../../src/hooks/bluesky/lexicon.js';

// R-40: a network whose lexicon the SDK does not ship is resolved from the authority the
// NSID itself names, so a further network is its prefix and no other configuration
describe('lexicon registration', () => {
  describe('lexiconAuthority', () => {
    it('reverses the NSID segments to the publishing domain', () => {
      expect(lexiconAuthority('town.delve')).toBe('delve.town');
      expect(lexiconAuthority('app.bsky')).toBe('bsky.app');
    });
  });

  describe('isBundledLexicon', () => {
    it('knows the one the SDK already carries', () => {
      expect(isBundledLexicon('app.bsky')).toBe(true);
      expect(isBundledLexicon('town.delve')).toBe(false);
    });
  });

  describe('registerLexicon', () => {
    const agentWith = (addLexicon: any) => ({
      api: { xrpc: { baseClient: { addLexicon } } },
    }) as any;

    let fetchMock: jest.Mock;
    let log: any;

    const ok = (body: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

    beforeEach(() => {
      log = jest.spyOn(console, 'log').mockImplementation(() => {});
      fetchMock = jest.fn();
      (global as any).fetch = fetchMock;
    });

    afterEach(() => {
      log.mockRestore();
    });

    it('fetches nothing for a lexicon the SDK already carries', async () => {
      const addLexicon = jest.fn();

      await expect(registerLexicon(agentWith(addLexicon), 'app.bsky', 'https://bsky.social'))
        .resolves.toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(addLexicon).not.toHaveBeenCalled();
    });

    it('resolves the authority, reads its schemas and registers every one', async () => {
      const record = (id: string) => ({ value: { $type: 'com.atproto.lexicon.schema', lexicon: 1, id, defs: {} } });

      (fetchMock as any)
        .mockImplementationOnce(() => ok({ did: 'did:plc:authority' }))
        .mockImplementationOnce(() => ok({
          service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.delve.town' }],
        }))
        .mockImplementationOnce(() => ok({
          records: [record('town.delve.feed.post')],
          cursor: 'next',
        }))
        .mockImplementationOnce(() => ok({ records: [record('town.delve.feed.like')] }));

      const addLexicon = jest.fn();
      const count = await registerLexicon(agentWith(addLexicon), 'town.delve', 'https://pds.delve.town');

      expect(count).toBe(2);
      expect(addLexicon).toHaveBeenCalledTimes(2);

      // the $type is the record's, not the lexicon's, and must not reach the registry
      expect(addLexicon).toHaveBeenNthCalledWith(1, { lexicon: 1, id: 'town.delve.feed.post', defs: {} });

      const urls = (fetchMock.mock.calls as any[]).map(call => String(call[0]));
      expect(urls[0]).toContain('com.atproto.identity.resolveHandle?handle=delve.town');
      expect(urls[1]).toBe('https://plc.directory/did:plc:authority');
      expect(urls[2]).toContain('collection=com.atproto.lexicon.schema');
      expect(urls[3]).toContain('cursor=next');
    });

    it('reads a did:web authority from its well-known document', async () => {
      (fetchMock as any)
        .mockImplementationOnce(() => ok({ did: 'did:web:api.delve.town' }))
        .mockImplementationOnce(() => ok({
          service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.delve.town' }],
        }))
        .mockImplementationOnce(() => ok({ records: [] }));

      await registerLexicon(agentWith(jest.fn()), 'town.delve', 'https://pds.delve.town');

      expect(String((fetchMock.mock.calls as any[])[1][0]))
        .toBe('https://api.delve.town/.well-known/did.json');
    });

    it('says which request failed rather than registering a partial lexicon', async () => {
      (fetchMock as any).mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404 }));

      await expect(registerLexicon(agentWith(jest.fn()), 'town.delve', 'https://pds.delve.town'))
        .rejects.toThrow('answered 404');
    });

    it('refuses an authority whose DID document names no PDS', async () => {
      (fetchMock as any)
        .mockImplementationOnce(() => ok({ did: 'did:plc:authority' }))
        .mockImplementationOnce(() => ok({ service: [] }));

      await expect(registerLexicon(agentWith(jest.fn()), 'town.delve', 'https://pds.delve.town'))
        .rejects.toThrow('names no PDS');
    });
  });
});
