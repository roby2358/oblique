import { describe, it, expect } from '@jest/globals';
import { drawLabel, describeWeights, NOTED_WEIGHTS } from '../src/weighted-draw.js';

// R-53: the band walk both gates draw with. Tested here once, rather than twice through the
// gates that use it.
describe('drawLabel', () => {
  const known = (label: string) => ['a', 'b', 'c'].includes(label);
  const weights = { a: 0.5, b: 0.3, c: 0.2 };

  it('lands in each band in proportion to its weight', () => {
    // Cumulative bands: a [0, .5), b [.5, .8), c [.8, 1)
    expect(drawLabel(weights, known, () => 0)).toBe('a');
    expect(drawLabel(weights, known, () => 0.49)).toBe('a');
    expect(drawLabel(weights, known, () => 0.5)).toBe('b');
    expect(drawLabel(weights, known, () => 0.79)).toBe('b');
    expect(drawLabel(weights, known, () => 0.8)).toBe('c');
    expect(drawLabel(weights, known, () => 0.99)).toBe('c');
  });

  it('normalizes a distribution that does not sum to one', () => {
    // Two labels at 0.1 each: the bands are halves of the total, not of 1
    expect(drawLabel({ a: 0.1, b: 0.1 }, known, () => 0.4)).toBe('a');
    expect(drawLabel({ a: 0.1, b: 0.1 }, known, () => 0.6)).toBe('b');
  });

  it('ignores a label the caller does not recognize', () => {
    expect(drawLabel({ sarcasm: 0.9, a: 0.1 }, known, () => 0.99)).toBe('a');
  });

  it('ignores a label at zero', () => {
    expect(drawLabel({ a: 0, b: 1 }, known, () => 0)).toBe('b');
  });

  it.each([
    ['no distribution at all', undefined],
    ['an empty distribution', {}],
    ['nothing recognizable in it', { sarcasm: 1 }],
    ['every weight at zero', { a: 0, b: 0 }],
  ])('answers null given %s', (_name, given) => {
    expect(drawLabel(given as any, known, () => 0.99)).toBeNull();
  });

  // A caller that falls back to its own draw should get the number this one did not spend,
  // which is what lets the register gate's fallback stay uniform
  it('spends no random when there is nothing to draw', () => {
    const random = () => {
      throw new Error('random was consumed');
    };

    expect(drawLabel({ sarcasm: 1 }, known, random)).toBeNull();
  });
});

describe('describeWeights', () => {
  it('keeps the heaviest NOTED_WEIGHTS, heaviest first', () => {
    const described = describeWeights({ a: 0.1, b: 0.5, c: 0.3, d: 0.05, e: 0.05 });

    expect(described).toBe('b 0.50, c 0.30, a 0.10');
    expect(described.split(', ')).toHaveLength(NOTED_WEIGHTS);
  });

  // A gate reporting a label it ignored is exactly what someone reading the note needs to see
  it('keeps a label the menu never offered', () => {
    expect(describeWeights({ sarcasm: 0.9, poem: 0.1 })).toContain('sarcasm 0.90');
  });

  it('says so when there is no distribution', () => {
    expect(describeWeights(undefined)).toBe('no distribution');
  });
});
