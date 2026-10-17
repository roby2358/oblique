import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// R-19: config.json is the whole configuration; there is nothing in code to fall back to
describe('Configuration load', () => {
  let fetchMock: jest.Mock<(url: string) => Promise<any>>;

  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  const fullConfig = {
    openrouter: {
      apiKey: 'sk-or-v1-file',
      models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5'],
      rotate: true,
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    },
    bluesky: { handle: 'oblique.test', password: 'app-password' },
    ignoreList: ['noisy.test'],
    botList: ['bot.test'],
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    fetchMock = jest.fn(async () => okResponse({}));
    (global as any).fetch = fetchMock;

    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns the file as written, with nothing added', async () => {
    fetchMock.mockResolvedValue(okResponse(fullConfig));
    const { loadConfig } = await import('../src/config.js');

    expect(await loadConfig()).toEqual(fullConfig);
  });

  it('keeps a partial file partial rather than filling it in', async () => {
    fetchMock.mockResolvedValue(okResponse({ openrouter: { apiKey: 'sk-or-v1-file' } }));
    const { loadConfig } = await import('../src/config.js');

    const config = await loadConfig();

    expect(config).toEqual({ openrouter: { apiKey: 'sk-or-v1-file' } });
    expect(config.openrouter.models).toBeUndefined();
    expect(config.ignoreList).toBeUndefined();
  });

  it('yields an empty config when config.json cannot be fetched', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { loadConfig } = await import('../src/config.js');

    expect(await loadConfig()).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('yields an empty config when config.json returns a non-OK status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const { loadConfig } = await import('../src/config.js');

    expect(await loadConfig()).toEqual({});
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not load config.json (404)')
    );
  });

  it('yields an empty config when config.json is malformed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    const { loadConfig } = await import('../src/config.js');

    expect(await loadConfig()).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('exposes the loaded config through getConfig after initializeConfig', async () => {
    fetchMock.mockResolvedValue(okResponse(fullConfig));
    const { initializeConfig, getConfig } = await import('../src/config.js');

    await initializeConfig();

    expect(getConfig()).toEqual(fullConfig);
  });
});
