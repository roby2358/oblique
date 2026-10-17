import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// R-19: the defaults, with /config.json merged over them
describe('Configuration load', () => {
  let fetchMock: jest.Mock<(url: string) => Promise<any>>;

  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    fetchMock = jest.fn(async () => okResponse({}));
    (global as any).fetch = fetchMock;

    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('yields the defaults when config.json cannot be fetched', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { loadConfigWithFallbacks, DEFAULT_CONFIG } = await import('../src/config.js');

    expect(await loadConfigWithFallbacks()).toEqual(DEFAULT_CONFIG);
    expect(console.warn).toHaveBeenCalled();
  });

  it('yields the defaults when config.json returns a non-OK status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const { loadConfigWithFallbacks, DEFAULT_CONFIG } = await import('../src/config.js');

    expect(await loadConfigWithFallbacks()).toEqual(DEFAULT_CONFIG);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not load config.json (404)')
    );
  });

  it('yields the defaults when config.json is malformed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    const { loadConfigWithFallbacks, DEFAULT_CONFIG } = await import('../src/config.js');

    expect(await loadConfigWithFallbacks()).toEqual(DEFAULT_CONFIG);
    expect(console.warn).toHaveBeenCalled();
  });

  it('merges a partial config.json over the defaults', async () => {
    fetchMock.mockResolvedValue(okResponse({ openrouter: { apiKey: 'sk-or-v1-file' } }));
    const { loadConfigWithFallbacks, DEFAULT_CONFIG } = await import('../src/config.js');

    const config = await loadConfigWithFallbacks();

    expect(config.openrouter.apiKey).toBe('sk-or-v1-file');
    expect(config.openrouter.models).toEqual(DEFAULT_CONFIG.openrouter.models);
    expect(config.openrouter.rotate).toBe(true);
    expect(config.openrouter.baseUrl).toBe(DEFAULT_CONFIG.openrouter.baseUrl);
    expect(config.ignoreList).toEqual([]);
    expect(config.botList).toEqual([]);
  });

  it('lets config.json replace the model list rather than merge into it', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ openrouter: { models: ['openai/gpt-5'], rotate: false } })
    );
    const { loadConfigWithFallbacks } = await import('../src/config.js');

    const config = await loadConfigWithFallbacks();

    expect(config.openrouter.models).toEqual(['openai/gpt-5']);
    expect(config.openrouter.rotate).toBe(false);
  });

  it('leaves DEFAULT_CONFIG untouched across loads', async () => {
    fetchMock.mockResolvedValue(okResponse({ openrouter: { apiKey: 'sk-or-v1-file' } }));
    const { loadConfigWithFallbacks, DEFAULT_CONFIG } = await import('../src/config.js');

    await loadConfigWithFallbacks();
    fetchMock.mockRejectedValue(new Error('network down'));
    const second = await loadConfigWithFallbacks();

    expect(DEFAULT_CONFIG.openrouter.apiKey).toBe('');
    expect(second.openrouter.apiKey).toBe('');
  });
});
