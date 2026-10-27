import { describe, it, expect, jest } from '@jest/globals';
import {
  chooseFeedPost,
  candidateLabel,
  feedMenu,
  feedQuestion,
  feedState,
  FEED_QUESTION,
  FEED_CANDIDATES,
  NO_PICK,
} from '../src/feed-choice.js';
import type { FeedCandidate } from '../src/hooks/bluesky/bluesky-client.js';
import type { JevClient } from '../src/hooks/jev/jev-client.js';

const candidate = (author: string, text: string): FeedCandidate => ({
  message: {
    uri: `at://${author}/post/1`,
    cid: 'cid-1',
    author,
    text,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    reason: 'feed',
  },
  replyCount: 0,
  isReply: false,
  isRepost: false,
});

const candidates = (count: number): FeedCandidate[] =>
  Array.from({ length: count }, (_unused, index) => candidate(`author${index}.test`, `Post ${index}`));

/** A Jev that answers one distribution, and records what it was asked. */
const jevAnswering = (probabilities: { [label: string]: number } | undefined) => {
  const decide = jest.fn<any>().mockResolvedValue({
    [FEED_QUESTION]: { type: 'choice', choice: NO_PICK, probabilities },
  });

  return { client: { decide, isConfigured: () => true } as unknown as JevClient, decide };
};

// R-54: the question Jev is asked about a feed
describe('feedQuestion', () => {
  it('offers a label per post, then the option of answering none of them', () => {
    const menu = feedMenu(candidates(2));

    expect(Object.keys(menu)).toEqual(['p1', 'p2', NO_PICK]);
    expect(menu.p1).toBe('@author0.test: Post 0');
    expect(menu.p2).toBe('@author1.test: Post 1');
  });

  it('describes answering nothing as the ordinary outcome', () => {
    expect(feedMenu([])[NO_PICK]).toContain('right answer more often than not');
  });

  it('asks a choice question', () => {
    const question = feedQuestion(candidates(2));

    expect(question.type).toBe('choice');
    expect(question.instructions).toContain('reframes the post');
  });

  // Jev is asked which post, not how to answer it: the register is a later gate's question,
  // about the one post that wins this one (D-27, D-28)
  it('tells Jev nothing of Oblique\'s voice, mission, registers or output format', () => {
    const asked = [...feedState(), JSON.stringify(feedQuestion(candidates(3)))].join('\n');

    for (const leak of ['supertext', 'psychotext', 'stanza', '# Response', 'increase engagement']) {
      expect(asked).not.toContain(leak);
    }
  });

  it('says a post is going past rather than addressed to the bot', () => {
    expect(feedState().join('\n')).toContain('Nobody below has addressed it');
  });
});

describe('chooseFeedPost', () => {
  it('draws the post whose band the draw lands in', async () => {
    const { client } = jevAnswering({ p1: 0.5, p2: 0.3, [NO_PICK]: 0.2 });

    // Cumulative bands: p1 [0, .5), p2 [.5, .8), none [.8, 1)
    const first = await chooseFeedPost(client, candidates(2), () => 0.1);
    const second = await chooseFeedPost(client, candidates(2), () => 0.6);

    expect(first.candidate?.message.author).toBe('author0.test');
    expect(second.candidate?.message.author).toBe('author1.test');
  });

  it('answers nothing when the draw lands on none', async () => {
    const { client } = jevAnswering({ p1: 0.5, p2: 0.3, [NO_PICK]: 0.2 });

    const choice = await chooseFeedPost(client, candidates(2), () => 0.9);

    expect(choice.candidate).toBeNull();
    expect(choice.note).toContain('no post');
  });

  it('reports the heaviest weights and how many posts it had', async () => {
    const { client } = jevAnswering({ p1: 0.7, [NO_PICK]: 0.3 });

    const choice = await chooseFeedPost(client, candidates(1), () => 0.1);

    expect(choice.note).toContain('drawn from Jev of 1');
    expect(choice.note).toContain('p1 0.70');
  });

  it('offers at most FEED_CANDIDATES posts', async () => {
    const { client, decide } = jevAnswering({ [NO_PICK]: 1 });

    await chooseFeedPost(client, candidates(FEED_CANDIDATES + 10), () => 0.5);

    const question = (decide.mock.calls[0] as any[])[0].questions[FEED_QUESTION];

    expect(Object.keys(question.criteria)).toHaveLength(FEED_CANDIDATES + 1);
    expect(question.criteria[candidateLabel(FEED_CANDIDATES)]).toBeUndefined();
  });

  it('never draws a post it did not offer', async () => {
    const { client } = jevAnswering({ p1: 0.1, p9: 0.9 });

    // p9 is past the end of a two-post menu: an answer to some other question, ignored
    const choice = await chooseFeedPost(client, candidates(2), () => 0.99);

    expect(choice.candidate?.message.author).toBe('author0.test');
  });

  // Every failure here ends in no post, which is the opposite of the register gate and is the
  // point: nothing is owed to anyone down this path (G-2, D-28)
  it('asks nobody when nothing qualified', async () => {
    const { client, decide } = jevAnswering({ p1: 1 });

    const choice = await chooseFeedPost(client, [], () => 0.5);

    expect(choice.candidate).toBeNull();
    expect(choice.note).toContain('nothing in the feed qualified');
    expect(decide).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no Jev at all', undefined],
    ['Jev is unconfigured', { decide: jest.fn(), isConfigured: () => false } as unknown as JevClient],
  ])('answers no post when %s', async (_name, client) => {
    const choice = await chooseFeedPost(client as JevClient | undefined, candidates(3), () => 0.5);

    expect(choice.candidate).toBeNull();
    expect(choice.note).toContain('Jev is not configured');
  });

  it('answers no post when Jev throws, and says why', async () => {
    const client = {
      decide: jest.fn(async () => {
        throw new Error('Jev API error: 502 bad gateway');
      }),
      isConfigured: () => true,
    } as unknown as JevClient;

    const choice = await chooseFeedPost(client, candidates(3), () => 0.5);

    expect(choice.candidate).toBeNull();
    expect(choice.note).toContain('Jev failed (Jev API error: 502 bad gateway)');
  });

  it.each([
    ['no distribution', undefined],
    ['an empty distribution', {}],
    ['nothing in it the menu offered', { sarcasm: 1 }],
    ['every weight at zero', { p1: 0, p2: 0 }],
  ])('answers no post given %s', async (_name, probabilities) => {
    const { client } = jevAnswering(probabilities as any);

    const choice = await chooseFeedPost(client, candidates(2), () => 0.5);

    expect(choice.candidate).toBeNull();
  });

  it('asks its question against the standing context, with the posts as the options', async () => {
    const { client, decide } = jevAnswering({ [NO_PICK]: 1 });

    await chooseFeedPost(client, candidates(2), () => 0.5);

    const request = (decide.mock.calls[0] as any[])[0];

    expect(request.state).toEqual(feedState());
    expect(Object.keys(request.questions)).toEqual([FEED_QUESTION]);
    expect(request).not.toHaveProperty('messages');
  });
});
