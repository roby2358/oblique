import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { chooseRegister, registerQuestion, registerState, REGISTER_QUESTION } from '../src/register-choice.js';
import { LENS_KEYS, REGISTER_KEYS } from '../src/registers/index.js';
import type { JevClient } from '../src/hooks/jev/jev-client.js';

const jevAnswering = (answer: unknown): JevClient => ({
  decide: jest.fn(async () => ({ [REGISTER_QUESTION]: answer })) as any,
  isConfigured: () => true,
});

const jevFailing = (message: string): JevClient => ({
  decide: jest.fn(async () => { throw new Error(message); }) as any,
  isConfigured: () => true,
});

describe('the register question', () => {
  it('offers the whole menu as its criteria', () => {
    const question = registerQuestion();

    expect(question.type).toBe('choice');
    expect(Object.keys(question.criteria)).toEqual(REGISTER_KEYS);
    expect(question.instructions).toContain('Decide what that answer should be');
  });

  // D-27: context, then the thread, then the post being judged
  it('states the context first and the post being answered last', () => {
    const state = registerState('@a: earlier', '@b: the post');

    expect(state).toHaveLength(3);
    expect(state[0]).toContain('Oblique is a bot on a social network');
    expect(state[1]).toContain('@a: earlier');
    expect(state[2]).toContain('@b: the post');
  });

  it('says so rather than leaving a blank where an empty thread would be', () => {
    expect(registerState('', '@b: the post')[1]).toContain('this is the start of the thread');
  });

  // The decision is made by something that has not been told how Oblique talks
  it('tells Jev nothing of the voice, the mission or the output format', () => {
    const asked = [...registerState('@a: earlier', '@b: the post'), registerQuestion().instructions].join('\n');

    expect(asked).not.toContain('# Response');
    expect(asked).not.toContain('Your mission');
    expect(asked).not.toContain('lateral');
  });
});

// R-48: every way the choice can fail leaves Oblique answering as it did before the gate
describe('chooseRegister', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('draws from the distribution Jev answers with', async () => {
    const jev = jevAnswering({
      type: 'choice',
      choice: 'poem',
      confidence: 0.7,
      probabilities: { poem: 1 },
    });

    const { register, note } = await chooseRegister(jev, 'history', 'message', () => 0.5);

    expect(register.key).toBe('poem');
    expect(note).toContain('Jev');
    expect(note).toContain('poem 1.00');
  });

  it('asks about the thread it was given, under the name the code uses', async () => {
    const jev = jevAnswering({ type: 'choice', choice: 'poem', probabilities: { poem: 1 } });

    await chooseRegister(jev, '@a: earlier', '@b: the post', Math.random);

    const request = (jev.decide as jest.Mock).mock.calls[0][0] as any;

    expect(Object.keys(request.questions)).toEqual([REGISTER_QUESTION]);
    expect(request.state[1]).toContain('@a: earlier');
    expect(request.state[2]).toContain('@b: the post');
  });

  it('can reach silence, when Jev is sure enough of it', async () => {
    const jev = jevAnswering({ type: 'choice', choice: 'silence', probabilities: { silence: 1 } });

    const { register } = await chooseRegister(jev, 'history', 'thanks, goodnight', Math.random);

    expect(register.key).toBe('silence');
    expect(register.postable).toBe(false);
  });

  it('falls back to a lens, and says why, when Jev is not configured', async () => {
    const { register, note } = await chooseRegister(undefined, 'history', 'message', Math.random);

    expect(LENS_KEYS).toContain(register.key);
    expect(note).toContain('not configured');
  });

  it('falls back to a lens when the key is missing', async () => {
    const unconfigured: JevClient = { decide: jest.fn() as any, isConfigured: () => false };

    const { register } = await chooseRegister(unconfigured, 'history', 'message', Math.random);

    expect(LENS_KEYS).toContain(register.key);
    expect(unconfigured.decide).not.toHaveBeenCalled();
  });

  it('falls back to a lens, and names the error, when the call fails', async () => {
    const { register, note } = await chooseRegister(jevFailing('Jev API error: 503'), 'h', 'm', Math.random);

    expect(LENS_KEYS).toContain(register.key);
    expect(note).toContain('Jev failed');
    expect(note).toContain('503');
  });

  it('falls back to a lens when the answer carries no distribution', async () => {
    const jev = jevAnswering({ type: 'choice', choice: 'poem' });

    const { register, note } = await chooseRegister(jev, 'history', 'message', Math.random);

    expect(LENS_KEYS).toContain(register.key);
    expect(note).toContain('no distribution');
  });

  it('falls back to a lens when the question comes back unanswered', async () => {
    const jev: JevClient = { decide: jest.fn(async () => ({})) as any, isConfigured: () => true };

    const { register } = await chooseRegister(jev, 'history', 'message', Math.random);

    expect(LENS_KEYS).toContain(register.key);
  });
});
