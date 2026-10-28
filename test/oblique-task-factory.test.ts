import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createReplyTask, createSendToLLMTask, truncateAtLastPunctuation } from '../src/oblique-task-factory.js';
import { MAX_BLUESKY_REPLY_CHARS } from '../src/reply-length.js';
import { getConfig } from '../src/config.js';
import type { BlueskyMessage } from '../src/types/index.js';
import type { LLMClient } from '../src/hooks/llm/llm-client.js';
import type { BlueskyClient } from '../src/hooks/bluesky/bluesky-client.js';
import type { JevClient } from '../src/hooks/jev/jev-client.js';
import type { DrakidionTask } from '../src/drakidion/drakidion-types.js';

// Filler that carries no punctuation, so a fixture's only boundaries are the ones it states
const filler = (count: number): string => 'a'.repeat(count);

describe('truncateAtLastPunctuation', () => {
  it('returns text at the limit unchanged', () => {
    const text = filler(MAX_BLUESKY_REPLY_CHARS);
    expect(truncateAtLastPunctuation(text)).toBe(text);
  });

  it('returns short text unchanged', () => {
    const text = 'This is a short message.';
    expect(truncateAtLastPunctuation(text)).toBe(text);
  });

  it('returns an empty string unchanged', () => {
    expect(truncateAtLastPunctuation('')).toBe('');
  });

  it.each(['.', '!', '?', ',', ':', ';', '\u2014', '\u2013', '\u2026', '(', '\n'])(
    'cuts over-long text at %j and drops the mark',
    (mark) => {
      const text = `${filler(250)}${mark}${filler(100)}`;
      const result = truncateAtLastPunctuation(text);
      expect(result).toBe(filler(250));
      expect(result.length).toBeLessThanOrEqual(MAX_BLUESKY_REPLY_CHARS);
    }
  );

  it('cuts at the last punctuation at or before the limit', () => {
    const text = `${filler(100)}.${filler(150)}!${filler(100)}`;
    expect(truncateAtLastPunctuation(text)).toBe(`${filler(100)}.${filler(150)}`);
  });

  it('cuts at the limit when the only punctuation is past it', () => {
    const text = `${filler(350)}.${filler(50)}`;
    const result = truncateAtLastPunctuation(text);
    expect(result).toBe(filler(MAX_BLUESKY_REPLY_CHARS));
    expect(result.length).toBe(MAX_BLUESKY_REPLY_CHARS);
  });

  it('cuts at the limit when there is no punctuation at all', () => {
    const result = truncateAtLastPunctuation(filler(400));
    expect(result).toBe(filler(MAX_BLUESKY_REPLY_CHARS));
  });

  it('falls through to the plain cut when the only punctuation is at index 0', () => {
    const result = truncateAtLastPunctuation(`.${filler(400)}`);
    expect(result).toBe(`.${filler(MAX_BLUESKY_REPLY_CHARS - 1)}`);
    expect(result.length).toBe(MAX_BLUESKY_REPLY_CHARS);
  });

  it('cuts one character over the limit at the last boundary', () => {
    const text = `${filler(200)}, ${filler(MAX_BLUESKY_REPLY_CHARS - 201)}`;
    expect(text.length).toBe(MAX_BLUESKY_REPLY_CHARS + 1);
    expect(truncateAtLastPunctuation(text)).toBe(filler(200));
  });
});

// R-17: the first snapshot of a reply chain carries the message it is answering
describe('createReplyTask', () => {
  const llmClient = {} as LLMClient;
  const blueskyClient = {} as BlueskyClient;
  const onWaitingTaskComplete = jest.fn();

  const notification: BlueskyMessage = {
    uri: 'at://did:plc:test/app.bsky.feed.post/first123',
    cid: 'bafyfirst123',
    author: 'testuser.bsky.social',
    text: 'Hello Oblique!',
    createdAt: new Date(),
    reason: 'mention',
  };

  it('carries the notification text as the conversation of v1', () => {
    const task = createReplyTask(notification, llmClient, undefined, blueskyClient, onWaitingTaskComplete);

    expect(task.version).toBe(1);
    expect(task.conversation).toEqual([{ role: 'user', content: 'Hello Oblique!' }]);
  });

  it('falls back to the placeholder when the notification has no text', () => {
    const textless = { ...notification, text: undefined } as unknown as BlueskyMessage;

    const task = createReplyTask(textless, llmClient, undefined, blueskyClient, onWaitingTaskComplete);

    expect(task.conversation).toEqual([{ role: 'user', content: '(no text provided)' }]);
  });

  it('keeps its own work and process rather than the factory defaults', () => {
    const task = createReplyTask(notification, llmClient, undefined, blueskyClient, onWaitingTaskComplete);

    expect(task.work).toEqual(['<thinking>']);
    expect(task.status).toBe('ready');
    expect(task.description).toBe('Notification from @testuser.bsky.social');
  });
});

describe('createSendToLLMTask quote post handling', () => {
  let mockLLMClient: LLMClient;
  let mockBlueskyClient: BlueskyClient;
  let mockOnWaitingTaskComplete: jest.Mock;
  let mockPredecessor: DrakidionTask;

  beforeEach(() => {
    const config = getConfig();
    config.botList = [];
    config.ignoreList = [];
    config.bluesky = config.bluesky || { handle: '', password: '' };
    config.openrouter = {
      apiKey: 'sk-or-v1-test',
      models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5'],
      rotate: true,
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    };

    mockLLMClient = {
      generateResponse: jest.fn()
    } as any;

    mockBlueskyClient = {
      getQuotedHistory: jest.fn(),
      getThreadHistory: jest.fn(),
      getHistory: jest.fn()
    } as any;

    mockOnWaitingTaskComplete = jest.fn();

    mockPredecessor = {
      taskId: 'test-task-1',
      version: 1,
      status: 'ready',
      description: 'Test predecessor',
      work: ['Test work'],
      conversation: [{ role: 'user', content: 'Test message' }],
      createdAt: new Date(),
      process: () => ({} as DrakidionTask)
    };
  });

  it('should use getQuotedHistory for quote notifications', async () => {
    const quoteNotification: BlueskyMessage = {
      uri: 'at://did:plc:test/app.bsky.feed.post/quote123',
      cid: 'bafyquote123',
      author: 'quoter.bsky.social',
      text: 'test 2 ( @oblique.yuwakisa.com will reply)',
      createdAt: new Date(),
      reason: 'quote',
    };

    const mockQuotedContent = [{
      author: 'quotedauthor.bsky.social',
      text: 'This is the original quoted post content'
    }];

    (mockBlueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue(mockQuotedContent);
    (mockLLMClient.generateResponse as jest.MockedFunction<any>).mockResolvedValue({
      content: 'Test LLM response',
      model: 'test-model'
    });

    createSendToLLMTask(
      quoteNotification,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockBlueskyClient.getHistory).toHaveBeenCalledWith(quoteNotification);
  });

  it('should use getThreadHistory for non-quote notifications', async () => {
    const mentionNotification: BlueskyMessage = {
      uri: 'at://did:plc:test/app.bsky.feed.post/mention123',
      cid: 'bafymention123',
      author: 'mentioner.bsky.social',
      text: 'Hello @oblique.yuwakisa.com',
      createdAt: new Date(),
      reason: 'mention',
    };

    const mockThreadHistory = [{
      author: 'mentioner.bsky.social',
      text: 'Hello @oblique.yuwakisa.com'
    }];

    (mockBlueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue(mockThreadHistory);
    (mockLLMClient.generateResponse as jest.MockedFunction<any>).mockResolvedValue({
      content: 'Test LLM response',
      model: 'test-model'
    });

    createSendToLLMTask(
      mentionNotification,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockBlueskyClient.getHistory).toHaveBeenCalledWith(mentionNotification);
  });

  it('should fallback to quote post text when quoted content cannot be fetched', async () => {
    const quoteNotification: BlueskyMessage = {
      uri: 'at://did:plc:test/app.bsky.feed.post/quote123',
      cid: 'bafyquote123',
      author: 'quoter.bsky.social',
      text: 'test 2 ( @oblique.yuwakisa.com will reply)',
      createdAt: new Date(),
      reason: 'quote',
    };

    (mockBlueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue(null);
    (mockLLMClient.generateResponse as jest.MockedFunction<any>).mockResolvedValue({
      content: 'Test LLM response',
      model: 'test-model'
    });

    createSendToLLMTask(
      quoteNotification,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockBlueskyClient.getHistory).toHaveBeenCalledWith(quoteNotification);
  });

  it('should use fallback preview when notification text is missing', () => {
    const incompleteNotification = {
      uri: 'at://did:plc:test/app.bsky.feed.post/empty123',
      cid: 'bafyempty123',
      author: 'missingtext.bsky.social',
      createdAt: new Date(),
      reason: 'mention'
    } as unknown as BlueskyMessage;

    (mockBlueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue([]);

    const task = createSendToLLMTask(
      incompleteNotification,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    expect(task.description).toBe('Oblique: (no text provided)');
  });
});

// R-50: the register reaches the chain's work, and silence ends it with a like
describe('createSendToLLMTask under the register gate', () => {
  let mockLLMClient: LLMClient;
  let mockBlueskyClient: BlueskyClient;
  let mockOnWaitingTaskComplete: jest.Mock;
  let mockPredecessor: DrakidionTask;

  const notification: BlueskyMessage = {
    uri: 'at://did:plc:test/app.bsky.feed.post/quiet',
    cid: 'bafyquiet',
    author: 'reader.one',
    text: 'thanks, goodnight',
    createdAt: new Date(),
    reason: 'reply',
  };

  const jevChoosing = (key: string): JevClient => ({
    decide: jest.fn(async () => ({
      register: { type: 'choice', choice: key, confidence: 1, probabilities: { [key]: 1 } },
    })) as any,
    isConfigured: () => true,
  });

  const run = async (jevClient: JevClient | undefined) => {
    createSendToLLMTask(
      notification,
      mockLLMClient,
      jevClient,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    return mockOnWaitingTaskComplete.mock.calls[0] as [string, DrakidionTask];
  };

  beforeEach(() => {
    const config = getConfig();
    config.botList = [];
    config.ignoreList = [];
    config.openrouter = {
      apiKey: 'sk-or-v1-test',
      models: ['anthropic/claude-sonnet-4.5'],
      rotate: false,
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    };

    mockLLMClient = { generateResponse: jest.fn() } as any;
    mockBlueskyClient = { getHistory: jest.fn(), post: jest.fn(), like: jest.fn() } as any;
    mockOnWaitingTaskComplete = jest.fn();

    mockPredecessor = {
      taskId: 'register-task-1',
      version: 1,
      status: 'ready',
      description: 'Test predecessor',
      work: ['Test work'],
      conversation: [{ role: 'user', content: 'thanks, goodnight' }],
      createdAt: new Date(),
      process: () => ({} as DrakidionTask),
    };

    (mockBlueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue([
      { author: 'oblique.test', text: 'an earlier reply' },
      { author: 'reader.one', text: 'thanks, goodnight' },
    ]);
    (mockBlueskyClient.like as jest.MockedFunction<any>).mockResolvedValue({ uri: 'at://like', cid: 'bafylike' });
    (mockLLMClient.generateResponse as jest.MockedFunction<any>).mockResolvedValue({
      content: '# Response\n\nA door is not a question.',
      model: 'test-model',
    });
  });

  it('says which register it answered in, in the work product', async () => {
    const [, successor] = await run(jevChoosing('architext'));

    const registerLine = successor.work.find(line => line.startsWith('Register: '));

    expect(registerLine).toContain('Register: architext');
    expect(registerLine).toContain('Jev');
    expect(successor.work[0]).toBe('Test work');
  });

  it('answers in the register Jev chose', async () => {
    await run(jevChoosing('oneliner'));

    const { conversation } = (mockLLMClient.generateResponse as jest.Mock).mock.calls[0][0] as any;

    expect(conversation[1].content).toContain('Exactly one sentence');
  });

  it('likes the post and ends the chain when the register is silence', async () => {
    const [taskId, successor] = await run(jevChoosing('silence'));

    expect(taskId).toBe('register-task-1');
    expect(successor.status).toBe('canceled');
    expect(successor.doneAt).toBeInstanceOf(Date);
    expect(mockBlueskyClient.like).toHaveBeenCalledWith(notification.uri);
    expect(successor.work[successor.work.length - 1])
      .toBe('Silence: liked @reader.one and left it');
  });

  it('never asks the LLM for a reply it has chosen not to make', async () => {
    await run(jevChoosing('silence'));

    expect(mockLLMClient.generateResponse).not.toHaveBeenCalled();
    expect(mockBlueskyClient.post).not.toHaveBeenCalled();
    expect(mockOnWaitingTaskComplete).toHaveBeenCalledTimes(1);
  });

  it('still answers, in a lens, when there is no Jev at all', async () => {
    const [, successor] = await run(undefined);

    const registerLine = successor.work.find(line => line.startsWith('Register: ')) ?? '';

    expect(registerLine).toContain('not configured');
    expect(successor.status).toBe('ready');
    expect(mockLLMClient.generateResponse).toHaveBeenCalled();
  });

  it('is not stopped by a like Bluesky refuses', async () => {
    (mockBlueskyClient.like as jest.MockedFunction<any>).mockRejectedValue(new Error('rate limited'));

    const [, successor] = await run(jevChoosing('silence'));

    expect(successor.status).toBe('canceled');
    expect(successor.work[successor.work.length - 1])
      .toBe('Silence: liked @reader.one and left it');
  });
});

// R-42: a chain a restraint rule declines ends terminal, and never reaches the LLM
describe('createSendToLLMTask under thread restraint', () => {
  let mockLLMClient: LLMClient;
  let mockBlueskyClient: BlueskyClient;
  let mockOnWaitingTaskComplete: jest.Mock;
  let mockPredecessor: DrakidionTask;

  const notification: BlueskyMessage = {
    uri: 'at://did:plc:test/app.bsky.feed.post/flood',
    cid: 'bafyflood',
    author: 'bot.alpha',
    text: 'again',
    createdAt: new Date(),
    reason: 'reply',
  };

  // bot.alpha holds 4 of the last 8, so the attenuation rule declines the thread
  const floodedThread = [
    'user.one', 'user.two', 'bot.alpha', 'user.three',
    'bot.alpha', 'bot.alpha', 'user.four', 'bot.alpha',
  ].map(author => ({ author, text: 'x' }));

  beforeEach(() => {
    const config = getConfig();
    config.botList = ['bot.alpha'];
    config.ignoreList = [];
    config.openrouter = {
      apiKey: 'sk-or-v1-test',
      models: ['anthropic/claude-sonnet-4.5'],
      rotate: false,
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    };

    mockLLMClient = { generateResponse: jest.fn() } as any;
    mockBlueskyClient = { getHistory: jest.fn(), post: jest.fn(), like: jest.fn() } as any;
    mockOnWaitingTaskComplete = jest.fn();

    mockPredecessor = {
      taskId: 'declined-task-1',
      version: 1,
      status: 'ready',
      description: 'Test predecessor',
      work: ['Test work'],
      conversation: [{ role: 'user', content: 'again' }],
      createdAt: new Date(),
      process: () => ({} as DrakidionTask),
    };

    (mockBlueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue(floodedThread);
  });

  it('ends the chain rather than leaving it waiting', async () => {
    createSendToLLMTask(
      notification,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockOnWaitingTaskComplete).toHaveBeenCalledTimes(1);

    const [taskId, successor] = mockOnWaitingTaskComplete.mock.calls[0] as [string, DrakidionTask];

    expect(taskId).toBe('declined-task-1');
    expect(successor.status).toBe('canceled');
    expect(successor.doneAt).toBeInstanceOf(Date);
  });

  it('says which rule declined it, in the work product', async () => {
    createSendToLLMTask(
      notification,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    const [, successor] = mockOnWaitingTaskComplete.mock.calls[0] as [string, DrakidionTask];

    expect(successor.work[successor.work.length - 1])
      .toBe('Declined: @bot.alpha wrote 4 of the last 8 posts');
  });

  // The gate is only as good as the reason it is handed: a call site passing anything but the
  // notification's own reason would attenuate every @ and fail none of the tests above (D-29)
  it('lets a human\'s @ through a thread the window would otherwise decline', async () => {
    const mention: BlueskyMessage = { ...notification, author: 'chatty.human', reason: 'mention' };
    const floodedByHuman = floodedThread.map(post =>
      ({ ...post, author: post.author === 'bot.alpha' ? 'chatty.human' : post.author }));

    (mockBlueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue(floodedByHuman);
    (mockLLMClient.generateResponse as jest.MockedFunction<any>)
      .mockResolvedValue({ content: 'an answer', model: 'test' });

    createSendToLLMTask(
      mention,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockLLMClient.generateResponse).toHaveBeenCalled();
  });

  it('never asks the LLM for a reply it has already declined', async () => {
    createSendToLLMTask(
      notification,
      mockLLMClient,
      undefined,
      mockBlueskyClient,
      mockOnWaitingTaskComplete,
      mockPredecessor
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockLLMClient.generateResponse).not.toHaveBeenCalled();
    expect(mockBlueskyClient.post).not.toHaveBeenCalled();
  });
});

// R-16: posting the reply — the refusal to post nothing, and success only on confirmation
describe('createPostReplyTask', () => {
  const notification: BlueskyMessage = {
    uri: 'at://did:plc:test/app.bsky.feed.post/abc',
    cid: 'cid-abc',
    author: 'user.test',
    text: 'Hello there',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    reason: 'reply',
  };

  const replyTo = {
    root: { uri: 'at://did:plc:test/app.bsky.feed.post/root', cid: 'cid-root' },
    parent: { uri: notification.uri, cid: notification.cid },
  };

  const postedUri = 'at://did:plc:test/app.bsky.feed.post/posted';
  const replyText = 'A door is not a question.';

  let blueskyClient: any;
  let completions: { taskId: string; successor: DrakidionTask }[];

  // Let the post promise settle, the way the orchestrator's event loop would
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  const onWaitingTaskComplete = (taskId: string, successor: DrakidionTask) => {
    completions.push({ taskId, successor });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    completions = [];

    blueskyClient = {
      notificationReplyTo: jest.fn(() => replyTo),
      like: jest.fn(async () => ({ uri: 'at://did:plc:test/app.bsky.feed.like/1', cid: 'cid-like' })),
      post: jest.fn(async () => ({ uri: postedUri, cid: 'cid-posted' })),
    };
  });

  const buildTask = async (text: string) => {
    const { createPostReplyTask } = await import('../src/oblique-task-factory.js');
    const { newReadyTask } = await import('../src/drakidion/task-factories.js');
    return createPostReplyTask(
      notification,
      text,
      blueskyClient as BlueskyClient,
      [],
      onWaitingTaskComplete,
      newReadyTask('Post reply')
    );
  };

  it('likes, posts, and waits for Bluesky before claiming success', async () => {
    const task = await buildTask(replyText);

    const successor = task.process!() as DrakidionTask;

    expect(blueskyClient.like).toHaveBeenCalledWith(notification.uri);
    expect(blueskyClient.post).toHaveBeenCalledWith({ text: replyText, replyTo });
    expect(blueskyClient.like.mock.invocationCallOrder[0])
      .toBeLessThan(blueskyClient.post.mock.invocationCallOrder[0]);

    // Nothing is claimed while the post is in flight
    expect(successor.status).toBe('waiting');
    expect(completions).toHaveLength(0);

    await flush();

    expect(completions).toHaveLength(1);
    expect(completions[0].taskId).toBe(successor.taskId);
    expect(completions[0].successor.status).toBe('succeeded');
    expect(completions[0].successor.version).toBe(successor.version + 1);
  });

  it('records the URI Bluesky returned, not a placeholder', async () => {
    const task = await buildTask(replyText);

    task.process!();
    await flush();

    expect(completions[0].successor.work).toEqual([replyText, `Posted: ${postedUri}`]);
  });

  it('dies when the post is rejected', async () => {
    blueskyClient.post.mockRejectedValue(new Error('network down'));
    const task = await buildTask(replyText);

    const successor = task.process!() as DrakidionTask;
    expect(successor.status).toBe('waiting');

    await flush();

    expect(completions).toHaveLength(1);
    expect(completions[0].successor.status).toBe('dead');
    expect(completions[0].successor.work).toEqual([replyText, 'Failed to post: network down']);
  });

  it('still posts when the like is rejected', async () => {
    blueskyClient.like.mockRejectedValue(new Error('like failed'));
    const task = await buildTask(replyText);

    task.process!();
    await flush();

    expect(blueskyClient.post).toHaveBeenCalled();
    expect(completions[0].successor.status).toBe('succeeded');
  });

  it('refuses to post an empty reply', async () => {
    const task = await buildTask('');

    const successor = task.process!() as DrakidionTask;

    expect(blueskyClient.post).not.toHaveBeenCalled();
    expect(blueskyClient.like).not.toHaveBeenCalled();
    expect(successor.status).toBe('dead');
    expect(successor.work).toEqual(['', 'Failed to post: Refusing to post an empty reply']);
  });

  it('refuses to post a whitespace-only reply', async () => {
    const task = await buildTask('   \n  ');

    const successor = task.process!() as DrakidionTask;

    expect(blueskyClient.post).not.toHaveBeenCalled();
    expect(successor.status).toBe('dead');
  });

  it('dies when resolving the reply target throws', async () => {
    blueskyClient.notificationReplyTo.mockImplementation(() => {
      throw new Error('no reply info');
    });
    const task = await buildTask(replyText);

    const successor = task.process!() as DrakidionTask;

    expect(blueskyClient.like).not.toHaveBeenCalled();
    expect(successor.status).toBe('dead');
    expect(successor.work).toEqual([replyText, 'Failed to post: no reply info']);
  });

  it('dies when liking throws before the post is dispatched', async () => {
    blueskyClient.like.mockImplementation(() => {
      throw new Error('like failed');
    });
    const task = await buildTask(replyText);

    const successor = task.process!() as DrakidionTask;

    expect(blueskyClient.post).not.toHaveBeenCalled();
    expect(successor.status).toBe('dead');
    expect(successor.work).toEqual([replyText, 'Failed to post: like failed']);
  });

  it('dies when dispatching the post throws', async () => {
    blueskyClient.post.mockImplementation(() => {
      throw new Error('no network');
    });
    const task = await buildTask(replyText);

    const successor = task.process!() as DrakidionTask;

    expect(successor.status).toBe('dead');
    expect(successor.work).toEqual([replyText, 'Failed to post: no network']);
  });
});

describe('reply length gate', () => {
  let llmClient: LLMClient;
  let blueskyClient: BlueskyClient;
  let onWaitingTaskComplete: jest.Mock;
  let predecessor: DrakidionTask;

  const notification: BlueskyMessage = {
    uri: 'at://did:plc:test/app.bsky.feed.post/len123',
    cid: 'bafylen123',
    author: 'asker.bsky.social',
    text: 'Hello @oblique.yuwakisa.com',
    createdAt: new Date(),
    reason: 'mention',
  };

  const response = (text: string) => ({ content: `# Response\n${text}`, model: 'test-model' });

  beforeEach(() => {
    const config = getConfig();
    config.botList = [];
    config.ignoreList = [];
    config.bluesky = config.bluesky || { handle: '', password: '' };
    config.openrouter = {
      apiKey: 'sk-or-v1-test',
      models: ['anthropic/claude-sonnet-4.5'],
      rotate: true,
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    };

    llmClient = { generateResponse: jest.fn() } as any;
    blueskyClient = { getHistory: jest.fn() } as any;
    (blueskyClient.getHistory as jest.MockedFunction<any>).mockResolvedValue([
      { author: 'asker.bsky.social', text: 'Hello @oblique.yuwakisa.com' },
    ]);
    onWaitingTaskComplete = jest.fn();

    predecessor = {
      taskId: 'length-task-1',
      version: 1,
      status: 'ready',
      description: 'Test predecessor',
      work: [],
      conversation: [{ role: 'user', content: 'Hello' }],
      createdAt: new Date(),
      process: () => ({} as DrakidionTask),
    };
  });

  const run = async () => {
    createSendToLLMTask(notification, llmClient, undefined, blueskyClient, onWaitingTaskComplete, predecessor);
    await new Promise(resolve => setTimeout(resolve, 10));
    const successor = onWaitingTaskComplete.mock.calls[0][1] as DrakidionTask;
    return successor.work[successor.work.length - 1];
  };

  it('accepts a response of exactly the limit without asking again', async () => {
    const atLimit = filler(MAX_BLUESKY_REPLY_CHARS);
    (llmClient.generateResponse as jest.MockedFunction<any>).mockResolvedValue(response(atLimit));

    const posted = await run();

    expect(llmClient.generateResponse).toHaveBeenCalledTimes(1);
    expect(posted).toBe(atLimit);
  });

  it('asks again when the response is one character over the limit', async () => {
    const overLimit = filler(MAX_BLUESKY_REPLY_CHARS + 1);
    (llmClient.generateResponse as jest.MockedFunction<any>)
      .mockResolvedValueOnce(response(overLimit))
      .mockResolvedValueOnce(response('Short enough.'));

    const posted = await run();

    expect(llmClient.generateResponse).toHaveBeenCalledTimes(2);
    expect(posted).toBe('Short enough.');
  });
});
