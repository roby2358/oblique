import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { XRPCError } from '@atproto/xrpc';
import {
  BlueskyClient,
  TOKEN_DEFAULT_TTL,
  TOKEN_REFRESH_BUFFER_MS,
  isUnauthorizedError,
} from '../../../src/hooks/bluesky/bluesky-client.js';

const config = {
  handle: 'oblique.test',
  appPassword: 'test-password',
  service: 'https://bsky.social',
  appview: 'did:web:api.bsky.app#bsky_appview',
  lexicon: 'app.bsky',
};

/** A session JWT carrying `payload` where its claims belong. Only the payload is read. */
const sessionJwt = (payload: object): string => {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
};

const unauthorized = () => new XRPCError(401, 'ExpiredToken', 'Token has expired');

describe('BlueskyClient authentication', () => {
  let login: any;
  let call: any;
  let createRecord: any;
  let agent: any;
  let client: BlueskyClient;
  let quiet: any[];

  /** The client with a mock agent, signed out, as it is before the first call. */
  const clientWith = (session: any) => {
    const fresh = new BlueskyClient(config);
    agent = {
      session,
      login,
      api: { xrpc: { call }, com: { atproto: { repo: { createRecord } } } },
    };
    (fresh as any).agent = agent;
    return fresh;
  };

  beforeEach(() => {
    quiet = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    login = jest.fn();
    login.mockResolvedValue(undefined as any);
    call = jest.fn();
    createRecord = jest.fn();
    createRecord.mockResolvedValue({ data: { uri: 'at://did:plc:test/x/abc', cid: 'cid-1' } } as any);
    client = clientWith({ accessJwt: sessionJwt({ exp: Math.floor(Date.now() / 1000) + 7200 }) });
  });

  afterEach(() => {
    quiet.forEach(spy => spy.mockRestore());
  });

  // R-20: ensureAuth signs in when, and only when, the token will not outlive the call
  describe('ensureAuth', () => {
    it('signs in when there is no session yet', async () => {
      await client.ensureAuth();

      expect(login).toHaveBeenCalledTimes(1);
      expect(login.mock.calls[0][0]).toEqual({
        identifier: 'oblique.test',
        password: 'test-password',
      });
      expect(client.isAuthenticated()).toBe(true);
    });

    it('leaves a token expiring beyond the buffer alone', async () => {
      (client as any).authenticated = true;
      (client as any).tokenExpiresAt = new Date(Date.now() + TOKEN_REFRESH_BUFFER_MS + 60_000);

      await client.ensureAuth();

      expect(login).not.toHaveBeenCalled();
    });

    it('signs in again for a token expiring inside the buffer', async () => {
      (client as any).authenticated = true;
      (client as any).tokenExpiresAt = new Date(Date.now() + TOKEN_REFRESH_BUFFER_MS - 60_000);

      await client.ensureAuth();

      expect(login).toHaveBeenCalledTimes(1);
    });

    it('leaves nothing behind when the login is rejected', async () => {
      login.mockRejectedValue(new Error('Invalid identifier or password') as never);

      await expect(client.ensureAuth()).rejects.toThrow('Invalid identifier or password');

      // the client must not believe it is signed in, or nothing would try again
      expect(client.isAuthenticated()).toBe(false);
      expect((client as any).tokenExpiresAt).toBeNull();
    });
  });

  // R-20: the expiry comes from the session JWT, and the fallback fails short of a real token
  describe('token expiry', () => {
    /** The expiry the client settled on, with the window it must fall inside. */
    const expiryAfterLogin = async (session: any): Promise<{ at: number; low: number; high: number }> => {
      const subject = clientWith(session);
      const low = Date.now();
      await subject.authenticate();
      const high = Date.now();

      return { at: (subject as any).tokenExpiresAt.getTime(), low, high };
    };

    it('reads the exp claim of the session JWT', async () => {
      const exp = Math.floor(Date.now() / 1000) + 7200;

      const { at } = await expiryAfterLogin({ accessJwt: sessionJwt({ exp }) });

      expect(at).toBe(exp * 1000);
    });

    it('falls back to TOKEN_DEFAULT_TTL for a JWT with no exp claim', async () => {
      const { at, low, high } = await expiryAfterLogin({ accessJwt: sessionJwt({ sub: 'did:plc:test' }) });

      expect(at).toBeGreaterThanOrEqual(low + TOKEN_DEFAULT_TTL);
      expect(at).toBeLessThanOrEqual(high + TOKEN_DEFAULT_TTL);
    });

    it('falls back for a payload that is not JSON, rather than throwing', async () => {
      const { at, low } = await expiryAfterLogin({ accessJwt: 'header.not-base64-json.signature' });

      expect(at).toBeGreaterThanOrEqual(low + TOKEN_DEFAULT_TTL);
    });

    it('falls back for a JWT with fewer than three segments', async () => {
      const { at, low } = await expiryAfterLogin({ accessJwt: 'header.payload' });

      expect(at).toBeGreaterThanOrEqual(low + TOKEN_DEFAULT_TTL);
    });

    it('falls back for a session with no accessJwt, and for no session at all', async () => {
      const noJwt = await expiryAfterLogin({});
      const noSession = await expiryAfterLogin(null);

      expect(noJwt.at).toBeGreaterThanOrEqual(noJwt.low + TOKEN_DEFAULT_TTL);
      expect(noSession.at).toBeGreaterThanOrEqual(noSession.low + TOKEN_DEFAULT_TTL);
    });

    it('guesses short of any real token, but not so short that every call signs in', () => {
      // a real access token lives about two hours; a guess longer than that is the silent
      // death this constant exists to prevent, and one inside the buffer is a login per call
      expect(TOKEN_DEFAULT_TTL).toBeLessThan(2 * 60 * 60 * 1000);
      expect(TOKEN_DEFAULT_TTL).toBeGreaterThan(TOKEN_REFRESH_BUFFER_MS);
    });
  });

  // R-44: a refused token is a reason to sign in again and retry the call once
  describe('isUnauthorizedError', () => {
    it('recognizes a 401 and a 400 carrying ExpiredToken', () => {
      expect(isUnauthorizedError(unauthorized())).toBe(true);
      expect(isUnauthorizedError(new XRPCError(400, 'ExpiredToken', 'Token has expired'))).toBe(true);
    });

    it('is not fooled by any other refusal', () => {
      expect(isUnauthorizedError(new XRPCError(400, 'InvalidRequest', 'bad uri'))).toBe(false);
      expect(isUnauthorizedError(new XRPCError(501, 'MethodNotImplemented', 'unknown'))).toBe(false);
      expect(isUnauthorizedError(new Error('network down'))).toBe(false);
      expect(isUnauthorizedError(null)).toBe(false);
    });

    it('reads the status rather than the error class, so a second copy of the SDK still retries', () => {
      expect(isUnauthorizedError({ status: 401 })).toBe(true);
    });
  });

  describe('a request refused as unauthorized', () => {
    const notificationList = {
      data: {
        notifications: [
          {
            uri: 'at://did:plc:test/app.bsky.feed.post/abc',
            cid: 'cid-abc',
            author: { handle: 'someone.test' },
            record: { text: 'hello' },
            indexedAt: new Date().toISOString(),
            reason: 'mention',
          },
        ],
      },
    };

    beforeEach(() => {
      (client as any).authenticated = true;
      (client as any).tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      (client as any).lexiconRegistered = true;
    });

    it('signs in again and retries the read once, so the pass is not lost', async () => {
      call.mockRejectedValueOnce(unauthorized() as never);
      call.mockResolvedValueOnce(notificationList as any);

      const notifications = await client.getNotifications(50, false);

      expect(notifications).toHaveLength(1);
      expect(notifications[0].author).toBe('someone.test');
      expect(login).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledTimes(2);
    });

    it('retries the write too, with the same record', async () => {
      createRecord.mockRejectedValueOnce(unauthorized() as never);

      await expect(client.post({ text: 'A reply' })).resolves.toEqual({
        uri: 'at://did:plc:test/x/abc',
        cid: 'cid-1',
      });

      expect(createRecord).toHaveBeenCalledTimes(2);
      expect(createRecord.mock.calls[1][0].record.text).toBe('A reply');
      expect(login).toHaveBeenCalledTimes(1);
    });

    it('retries once only, and lets a second refusal reach the caller', async () => {
      call.mockRejectedValue(unauthorized() as never);

      await expect(client.getNotifications(50, false)).rejects.toThrow('Token has expired');

      // the panel reports the account's error, so a PDS that keeps refusing is visible
      expect(login).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledTimes(2);
    });

    it('does not sign in again for a refusal that is not about the token', async () => {
      call.mockRejectedValue(new XRPCError(501, 'MethodNotImplemented', 'unknown method') as never);

      await expect(client.getNotifications(50, false)).rejects.toThrow('unknown method');

      expect(login).not.toHaveBeenCalled();
      expect(call).toHaveBeenCalledTimes(1);
    });
  });
});
