import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createOpenRouterJevClient } from '../../../src/hooks/jev/openrouter-decisions.js';

// R-49: Jev speaks the Decisions protocol, not chat completions
describe('OpenRouter Jev client', () => {
  const config = {
    apiKey: 'sk-or-v1-test',
    baseUrl: 'https://openrouter.ai/api/alpha/decisions',
    model: '~typesafe/jev-latest',
  };

  const request = {
    state: ['context', 'the thread', 'the post'],
    questions: {
      register: {
        type: 'choice' as const,
        instructions: 'Which register?',
        criteria: { poem: 'a poem', oneliner: 'one line' },
      },
    },
  };

  const answer = {
    register: { type: 'choice', choice: 'poem', confidence: 0.6, probabilities: { poem: 0.6, oneliner: 0.4 } },
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
    fetchMock = jest.fn(async () => okResponse({ answers: answer }));
    (global as any).fetch = fetchMock;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('returns the answers, keyed by the names the request used', async () => {
    const answers = await createOpenRouterJevClient(config).decide(request);

    expect(answers).toEqual(answer);
  });

  it('posts the state and the questions to the decisions endpoint', async () => {
    await createOpenRouterJevClient(config).decide(request);

    const [url, options] = fetchMock.mock.calls[0] as [string, any];

    expect(url).toBe(config.baseUrl);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer sk-or-v1-test');

    const body = JSON.parse(options.body);

    expect(body).toEqual({
      model: '~typesafe/jev-latest',
      state: request.state,
      questions: request.questions,
    });
    expect(body.messages).toBeUndefined();
  });

  it('throws with the status and the body when the call is refused', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'slow down',
      json: async () => ({}),
    });

    await expect(createOpenRouterJevClient(config).decide(request))
      .rejects.toThrow('Jev API error: 429 slow down');
  });

  it('throws rather than returning nothing when the answers are missing', async () => {
    fetchMock.mockResolvedValue(okResponse({ usage: { input_tokens: 1 } }));

    await expect(createOpenRouterJevClient(config).decide(request))
      .rejects.toThrow('Jev returned no answers');
  });

  it('is unconfigured without a key', () => {
    expect(createOpenRouterJevClient({ ...config, apiKey: '' }).isConfigured()).toBe(false);
    expect(createOpenRouterJevClient(config).isConfigured()).toBe(true);
  });

  // R-35: the key travels in the headers, so the headers are never logged
  it('logs the body and never the headers', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await createOpenRouterJevClient(config).decide(request);

    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-or-v1-test');
  });
});
