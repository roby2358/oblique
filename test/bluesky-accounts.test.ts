import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createAccounts, normalizeHandle } from '../src/bluesky-accounts.js';

// R-38: every configured section becomes an account signed in at its own PDS
describe('createAccounts', () => {
  const bluesky = {
    handle: 'oblique.yuwakisa.com',
    password: 'app-password-1',
    service: 'https://bsky.social',
    appview: 'did:web:api.bsky.app#bsky_appview',
    lexicon: 'app.bsky',
  };

  const delvetown = {
    handle: 'oblique.delve.town',
    password: 'app-password-2',
    service: 'https://pds.delve.town',
    appview: 'did:web:api.delve.town#bsky_appview',
    lexicon: 'town.delve',
  };

  let warn: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('builds one account per configured section, in order', () => {
    const accounts = createAccounts({ bluesky, delvetown });

    expect(accounts.map(account => account.name)).toEqual(['bluesky', 'delvetown']);
    expect(accounts.map(account => account.handle))
      .toEqual(['oblique.yuwakisa.com', 'oblique.delve.town']);
  });

  it('gives each client the PDS named in its own section', () => {
    const accounts = createAccounts({ bluesky, delvetown });

    expect(accounts.map(account => account.client.serviceUrl()))
      .toEqual(['https://bsky.social', 'https://pds.delve.town']);
  });

  it('points each client at the AppView named in its own section', () => {
    const accounts = createAccounts({ bluesky, delvetown });

    // the atproto-proxy header is the whole mechanism: the PDS forwards reads to the
    // AppView this names, and delve.town's PDS forwards nowhere without it
    const proxyHeader = (account: any) => account.client.agent.api.xrpc.headers['atproto-proxy'];

    expect(accounts.map(proxyHeader))
      .toEqual(['did:web:api.bsky.app#bsky_appview', 'did:web:api.delve.town#bsky_appview']);
  });

  it('strips a leading @ from the handle', () => {
    const accounts = createAccounts({ bluesky: { ...bluesky, handle: '@oblique.yuwakisa.com' } });

    expect(accounts[0].handle).toBe('oblique.yuwakisa.com');
  });

  it('passes over a blank or absent section in silence', () => {
    const accounts = createAccounts({
      bluesky,
      delvetown: { handle: '', password: '', service: '', appview: '', lexicon: '' },
    });

    expect(accounts.map(account => account.name)).toEqual(['bluesky']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses a half filled in section and names what is missing', () => {
    const accounts = createAccounts({ delvetown: { handle: 'oblique.delve.town' } });

    expect(accounts).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Ignoring the "delvetown" account: config.json is missing password, service, appview, lexicon'
    );
  });

  it('finds no account in an unconfigured file', () => {
    expect(createAccounts({})).toEqual([]);
  });
});

describe('normalizeHandle', () => {
  it('removes one leading @ and leaves the rest alone', () => {
    expect(normalizeHandle('@a.bsky.social')).toBe('a.bsky.social');
    expect(normalizeHandle('a.bsky.social')).toBe('a.bsky.social');
  });

  it('answers an empty string for nothing at all', () => {
    expect(normalizeHandle(undefined)).toBe('');
    expect(normalizeHandle(null)).toBe('');
  });
});
