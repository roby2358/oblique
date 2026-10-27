import { describe, it, expect } from '@jest/globals';
import {
  FeedSchedule,
  nextLookAt,
  FEED_MIN_MIN,
  FEED_SPREAD_MIN,
} from '../src/feed-schedule.js';

const MINUTE_MS = 60 * 1000;

// A random that walks a fixed list, so a draw is a stated position in the range rather than an
// accident of the generator
const sequence = (values: number[]): (() => number) => {
  let next = 0;
  return () => values[next++ % values.length];
};

// R-55: the interval is drawn once per reset, not tested afresh on every pass. The difference
// is the whole decision (D-28).
describe('nextLookAt', () => {
  it('draws the floor at the bottom of the range and the ceiling at the top', () => {
    expect(nextLookAt(0, () => 0)).toBe(FEED_MIN_MIN * MINUTE_MS);
    expect(nextLookAt(0, () => 0.5)).toBe((FEED_MIN_MIN + FEED_SPREAD_MIN / 2) * MINUTE_MS);
    expect(nextLookAt(0, () => 0.999)).toBeLessThan((FEED_MIN_MIN + FEED_SPREAD_MIN) * MINUTE_MS);
  });

  it('never falls sooner than the floor', () => {
    for (const at of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(nextLookAt(1000, () => at)).toBeGreaterThanOrEqual(1000 + FEED_MIN_MIN * MINUTE_MS);
    }
  });

  /**
   * The bug this function exists to avoid. A threshold re-drawn on every pass fires on the
   * first low draw, so the wait is the minimum of many draws rather than one of them: across
   * the span of the intended range it lands far below the intended mean, and the upper half of
   * the range is never reached. Drawn once, the same generator gives the interval it named.
   */
  it('gives one draw rather than the minimum of many', () => {
    const draws = [0.9, 0.8, 0.1, 0.7];
    const drawnOnce = nextLookAt(0, sequence(draws)) / MINUTE_MS;

    // The first draw, and nothing else: a later low draw cannot pull the target in
    expect(drawnOnce).toBe(FEED_MIN_MIN + 0.9 * FEED_SPREAD_MIN);

    // What re-drawing every pass would have given instead: the lowest of the four
    const reDrawnEachPass = Math.min(...draws.map(at => FEED_MIN_MIN + at * FEED_SPREAD_MIN));
    expect(reDrawnEachPass).toBeLessThan(drawnOnce);
  });
});

describe('FeedSchedule', () => {
  const now = 1_000_000;

  // Otherwise a page load opens with an unsolicited post, and so does every reload after it
  it('arms an account on first sight rather than firing it', () => {
    const schedule = new FeedSchedule(() => 0);

    expect(schedule.isDue('a.test', now)).toBe(false);
    expect(schedule.dueFor('a.test')).toBe(now + FEED_MIN_MIN * MINUTE_MS);
  });

  it('comes due once the drawn interval has passed, and not before', () => {
    const schedule = new FeedSchedule(() => 0);
    const due = FEED_MIN_MIN * MINUTE_MS;

    schedule.isDue('a.test', now);

    expect(schedule.isDue('a.test', now + due - 1)).toBe(false);
    expect(schedule.isDue('a.test', now + due)).toBe(true);
  });

  it('stays due until it is reset', () => {
    const schedule = new FeedSchedule(() => 0);
    const past = now + FEED_MIN_MIN * MINUTE_MS;

    schedule.isDue('a.test', now);

    expect(schedule.isDue('a.test', past)).toBe(true);
    expect(schedule.isDue('a.test', past)).toBe(true);

    schedule.reset('a.test', past);

    expect(schedule.isDue('a.test', past)).toBe(false);
  });

  it('draws a fresh interval on every reset', () => {
    const schedule = new FeedSchedule(sequence([0, 1, 0.5]));

    schedule.isDue('a.test', 0);
    expect(schedule.dueFor('a.test')).toBe(FEED_MIN_MIN * MINUTE_MS);

    schedule.reset('a.test', 0);
    expect(schedule.dueFor('a.test')).toBe((FEED_MIN_MIN + FEED_SPREAD_MIN) * MINUTE_MS);

    schedule.reset('a.test', 0);
    expect(schedule.dueFor('a.test')).toBe((FEED_MIN_MIN + FEED_SPREAD_MIN / 2) * MINUTE_MS);
  });

  // Each network has its own timeline and its own audience, and the two are drawn
  // independently so they do not fall into step (D-22, D-28)
  it('keeps one clock per account', () => {
    const schedule = new FeedSchedule(sequence([0, 1]));

    schedule.isDue('a.test', 0);
    schedule.isDue('b.test', 0);

    expect(schedule.dueFor('a.test')).toBe(FEED_MIN_MIN * MINUTE_MS);
    expect(schedule.dueFor('b.test')).toBe((FEED_MIN_MIN + FEED_SPREAD_MIN) * MINUTE_MS);
  });

  it('comes due for one account without coming due for the other', () => {
    const schedule = new FeedSchedule(sequence([0, 1]));
    const between = (FEED_MIN_MIN + FEED_SPREAD_MIN / 2) * MINUTE_MS;

    schedule.isDue('a.test', 0);
    schedule.isDue('b.test', 0);

    expect(schedule.isDue('a.test', between)).toBe(true);
    expect(schedule.isDue('b.test', between)).toBe(false);
  });

  it('knows nothing of an account it has never seen', () => {
    expect(new FeedSchedule(() => 0).dueFor('a.test')).toBeUndefined();
  });
});
