import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createOpenRouterClient } from '../../../src/hooks/llm/openrouter.js';

// R-35: the client never reports success with nothing to post
describe('OpenRouter client', () => {
  const config = {
    apiKey: 'sk-or-v1-test',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  };

  const request = {
    conversation: [{ role: 'user' as const, content: 'hello' }],
    model: 'anthropic/claude-sonnet-4.5',
    temperature: 0.8,
    maxTokens: 2000,
  };

  let fetchMock: jest.Mock<(url: string, options: unknown) => Promise<any>>;

  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn(async () => okResponse({}));
    (global as any).fetch = fetchMock;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('returns the content when the model answers', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        choices: [{ message: { content: '# Response\n\nA door is not a question.' } }],
        model: 'anthropic/claude-3.5-haiku',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })
    );

    const response = await createOpenRouterClient(config).generateResponse(request);

    expect(response.content).toBe('# Response\n\nA door is not a question.');
    expect(response.model).toBe('anthropic/claude-3.5-haiku');
    expect(response.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it('sends the model named on the request', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        choices: [{ message: { content: 'text' } }],
        model: 'anthropic/claude-sonnet-4.5',
      })
    );

    await createOpenRouterClient(config).generateResponse(request);

    const [, options] = fetchMock.mock.calls[0] as [string, any];
    expect(JSON.parse(options.body).model).toBe('anthropic/claude-sonnet-4.5');
  });

  it('turns reasoning off, so the token budget goes to the visible answer', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        choices: [{ message: { content: 'text' } }],
        model: 'anthropic/claude-sonnet-4.5',
      })
    );

    await createOpenRouterClient(config).generateResponse(request);

    const [, options] = fetchMock.mock.calls[0] as [string, any];
    expect(JSON.parse(options.body).reasoning).toEqual({ enabled: false });
  });

  it('never logs the API key', async () => {
    const logged = console.log as jest.Mock<(...args: unknown[]) => void>;
    fetchMock.mockResolvedValue(
      okResponse({
        choices: [{ message: { content: 'text' } }],
        model: 'anthropic/claude-sonnet-4.5',
      })
    );

    await createOpenRouterClient(config).generateResponse(request);

    const everythingLogged = JSON.stringify(logged.mock.calls);
    expect(everythingLogged).not.toContain(config.apiKey);
    expect(everythingLogged).not.toContain('Authorization');
  });

  it('throws when the payload carries no choices', async () => {
    fetchMock.mockResolvedValue(okResponse({ choices: [], model: 'some/model' }));

    await expect(createOpenRouterClient(config).generateResponse(request)).rejects.toThrow(
      'OpenRouter returned no content for model some/model'
    );
  });

  it('throws when the content is null, naming the finish reason', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        choices: [{ message: { content: null }, finish_reason: 'length' }],
        model: 'some/model',
      })
    );

    await expect(createOpenRouterClient(config).generateResponse(request)).rejects.toThrow(
      'OpenRouter returned no content for model some/model (finish_reason: length)'
    );
  });

  it('throws when the content is empty or only whitespace', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ choices: [{ message: { content: '   \n  ' } }], model: 'some/model' })
    );

    await expect(createOpenRouterClient(config).generateResponse(request)).rejects.toThrow(
      'OpenRouter returned no content'
    );
  });

  it('throws on a non-OK status, carrying the body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
      json: async () => ({}),
    });

    await expect(createOpenRouterClient(config).generateResponse(request)).rejects.toThrow(
      'OpenRouter API error: 429 rate limited'
    );
  });
});
