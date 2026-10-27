import { describe, it, expect } from '@jest/globals';
import {
  REGISTERS,
  REGISTER_KEYS,
  LENS_KEYS,
  registerMenu,
  isRegisterKey,
  randomLensRegister,
  sampleRegister,
} from '../../src/registers/index.js';
import { ADVERTISED_REPLY_CHARS } from '../../src/reply-length.js';

// A random that walks a fixed list, so a draw is a stated position in the range rather than
// an accident of the generator
const sequence = (values: number[]): (() => number) => {
  let next = 0;
  return () => values[next++ % values.length];
};

// R-45: every register is in the menu, described once, and says what it does with a prompt
describe('the register menu', () => {
  it('offers all seven registers', () => {
    expect(REGISTER_KEYS).toEqual([
      'supertext', 'subtext', 'architext', 'psychotext', 'poem', 'oneliner', 'silence',
    ]);
  });

  it('describes every register to Jev, under its own key', () => {
    const menu = registerMenu();

    expect(Object.keys(menu)).toEqual(REGISTER_KEYS);

    for (const key of REGISTER_KEYS) {
      expect(menu[key]).toBe(REGISTERS[key].criterion);
      expect(menu[key].length).toBeGreaterThan(20);
      // The menu is read by a model that is told nothing else about Oblique, so an option
      // described only by its name would be a guess
      expect(menu[key]).not.toContain(key);
    }
  });

  it('knows its own keys and nothing else', () => {
    expect(isRegisterKey('poem')).toBe(true);
    expect(isRegisterKey('architext')).toBe(true);
    expect(isRegisterKey('')).toBe(false);
    expect(isRegisterKey('sarcasm')).toBe(false);
    expect(isRegisterKey('toString')).toBe(false);
  });

  it('makes silence the only register with nothing to post', () => {
    for (const key of REGISTER_KEYS) {
      expect(REGISTERS[key].postable).toBe(key !== 'silence');
    }
  });
});

// R-45: each register asks for its own shape, and silence refuses to be written
describe('each register', () => {
  const occasion = { kind: 'reply' as const, userMessage: '@someone: the message', threadHistory: 'history' };

  it.each(REGISTER_KEYS.filter(key => key !== 'silence'))(
    '%s builds a prompt carrying the voice, the thread and the message',
    (key) => {
      const prompt = REGISTERS[key].prompt(occasion, 'female');

      expect(prompt).toContain('Your mission is to increase engagement');
      expect(prompt).toContain('You are female. Reply in a female voice.');
      expect(prompt).toContain('history');
      expect(prompt).toContain('@someone: the message');
      expect(prompt).toContain(String(ADVERTISED_REPLY_CHARS));
    }
  );

  it.each(LENS_KEYS)('%s looks through a lens of that name', (key) => {
    const prompt = REGISTERS[key].prompt(occasion, 'male');

    expect(prompt).toContain('Reply through this lens');
    expect(prompt.toLowerCase()).toContain(key);
    expect(prompt).toContain('brief (1-3 sentences)');
  });

  it('asks the poem for one stanza and not for sentences', () => {
    const prompt = REGISTERS.poem.prompt(occasion, 'male');

    expect(prompt).toContain('One stanza');
    expect(prompt).not.toContain('Reply through this lens');
    expect(prompt).not.toContain('1-3 sentences');
  });

  it('asks the one-liner for exactly one sentence and no lens', () => {
    const prompt = REGISTERS.oneliner.prompt(occasion, 'male');

    expect(prompt).toContain('Exactly one sentence');
    expect(prompt).not.toContain('Reply through this lens');
  });

  it('refuses to build a prompt for silence rather than building an empty one', () => {
    expect(() => REGISTERS.silence.prompt(occasion, 'male'))
      .toThrow('The silence register has no prompt');
  });

  // 4.24: the occasion is separate from the register, so a register can open a thread as well
  // as answer one
  it('opens a thread of its own when there is nothing to answer', () => {
    const prompt = REGISTERS.subtext.prompt({ kind: 'opening', about: 'the last ferry' }, 'male');

    expect(prompt).toContain('Nobody has spoken yet');
    expect(prompt).toContain('the last ferry');
    expect(prompt).not.toContain('Thread history');
  });
});

// R-47: the register is drawn from Jev's distribution, not taken from the top of it
describe('sampleRegister', () => {
  const probabilities = { psychotext: 0.5, poem: 0.3, silence: 0.2 };

  it('lands in each band in proportion to its weight', () => {
    // Cumulative bands: psychotext [0, .5), poem [.5, .8), silence [.8, 1)
    expect(sampleRegister(probabilities, () => 0).key).toBe('psychotext');
    expect(sampleRegister(probabilities, () => 0.49).key).toBe('psychotext');
    expect(sampleRegister(probabilities, () => 0.5).key).toBe('poem');
    expect(sampleRegister(probabilities, () => 0.79).key).toBe('poem');
    expect(sampleRegister(probabilities, () => 0.8).key).toBe('silence');
    expect(sampleRegister(probabilities, () => 0.99).key).toBe('silence');
  });

  it('does not always answer with the likeliest register', () => {
    const drawn = new Set(
      [0.1, 0.3, 0.6, 0.7, 0.85, 0.95].map(at => sampleRegister(probabilities, () => at).key)
    );

    expect(drawn.size).toBeGreaterThan(1);
    expect(drawn).toContain('psychotext');
    expect(drawn).toContain('poem');
  });

  it('normalizes a distribution that does not sum to one', () => {
    // Two options at 0.1 each: the midpoint of the range falls in the first
    expect(sampleRegister({ poem: 0.1, oneliner: 0.1 }, () => 0.4).key).toBe('poem');
    expect(sampleRegister({ poem: 0.1, oneliner: 0.1 }, () => 0.6).key).toBe('oneliner');
  });

  it('ignores labels that are not registers', () => {
    const register = sampleRegister({ sarcasm: 0.9, poem: 0.1 }, () => 0.99);

    expect(register.key).toBe('poem');
  });

  it('ignores a register at zero', () => {
    expect(sampleRegister({ poem: 0, oneliner: 1 }, () => 0).key).toBe('oneliner');
  });

  it.each([
    ['no distribution at all', undefined],
    ['an empty distribution', {}],
    ['nothing recognizable in it', { sarcasm: 1 }],
    ['every weight at zero', { poem: 0, silence: 0 }],
  ])('falls back to the lenses given %s', (_name, given) => {
    const register = sampleRegister(given as any, () => 0.99);

    expect(LENS_KEYS).toContain(register.key);
  });

  // A fallback that could choose silence would turn a broken Jev into a quiet bot
  it('never falls back to silence', () => {
    const drawn = new Set(
      [0, 0.25, 0.5, 0.75, 0.999].map(at => randomLensRegister(() => at).key)
    );

    expect(drawn).not.toContain('silence');
    expect([...drawn].every(key => LENS_KEYS.includes(key as any))).toBe(true);
    expect(drawn.size).toBe(4);
  });

  it('reaches every lens over a walk of the range', () => {
    const random = sequence([0, 0.3, 0.6, 0.9]);
    const drawn = [0, 1, 2, 3].map(() => randomLensRegister(random).key);

    expect(new Set(drawn)).toEqual(new Set(LENS_KEYS));
  });
});
