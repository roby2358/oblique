// What shape a reply takes
//
// A register is one way Oblique can answer: a framing to look through and a set of rules for
// what comes back. The four lenses, a poem, a one-liner and silence are all registers, so the
// choice between them is one decision over one menu rather than a lens choice and a form
// choice that have to be reconciled (D-27).
//
// The occasion is separate from the register on purpose. A register says how Oblique speaks;
// the occasion says what it is speaking to. Answering a post is the occasion that exists
// today; opening a thread of its own is the one being built toward.

import { ADVERTISED_REPLY_CHARS } from '../reply-length.js';

/**
 * The four lenses, as a type of their own. Narrower than `RegisterKey` so that the one thing
 * the fallback guarantees — that a failed decision never ends in silence — is held by the
 * compiler rather than only by its test (D-27).
 */
export type LensKey = 'supertext' | 'subtext' | 'architext' | 'psychotext';

export type RegisterKey = LensKey | 'poem' | 'oneliner' | 'silence';

/** Answering a post in its thread. */
export interface ReplyOccasion {
  kind: 'reply';
  userMessage: string;
  threadHistory: string;
}

/** Posting with nothing to answer. Built, not yet wired to a caller (4.24). */
export interface OpeningOccasion {
  kind: 'opening';
  about: string;
}

export type Occasion = ReplyOccasion | OpeningOccasion;

/**
 * The fixed opening. Shared by every register and every occasion, so it sits in the longest
 * stretch of prompt that never varies and a provider's prefix cache keeps it (R-37).
 */
const MISSION =
`Your mission is to increase engagement by providing insight and sense-making.

The intent is be an agent of sense-making to help the user build a coherent narrative
  of their world.

Consider the positive and the negative, the Western and the Eastern, reward
  and threat. Span cultural and psychological boundaries. Favor the obscure
  and eclectic.`;

/**
 * The closing restatement: fixed text in the least cacheable position, there for recency
 * rather than for caching, and short because it is paid for on every request (D-21).
 */
const CLOSING =
`Answer now, in the register described above, in the sections given. The # Response section
is what gets posted, and it must be ${ADVERTISED_REPLY_CHARS} characters or less.`;

export abstract class Register {
  /** The name this register answers to, in the menu and in the work line. */
  abstract readonly key: RegisterKey;

  /** What this register means, as Jev reads it in the menu. One line, no jargon. */
  abstract readonly criterion: string;

  /** Whether this register produces text to post. Only silence does not. */
  readonly postable: boolean = true;

  /** How to look at the post. */
  protected abstract framing(): string;

  /** What shape the answer takes. */
  protected abstract rules(): string;

  /**
   * The prompt, ordered least volatile first: the fixed mission, then the voice (one value
   * per UTC day), then this register (drawn per reply), then the occasion, then the fixed
   * closing. Anything above a variable is cached for every request that shares it; anything
   * below one is re-read whenever it changes (R-37, D-21).
   */
  prompt(occasion: Occasion, gender: string): string {
    return [
      MISSION,
      `You are ${gender}. Reply in a ${gender} voice.`,
      this.framing(),
      this.rules(),
      this.occasion(occasion),
      CLOSING,
    ].join('\n\n');
  }

  private occasion(occasion: Occasion): string {
    if (occasion.kind === 'opening') {
      return `Nobody has spoken yet. Open a thread of your own on this:\n\n  "${occasion.about}"`;
    }

    return `Thread history:\n\n  "${occasion.threadHistory}"\n\n` +
           `Reply to this message:\n\n  "${occasion.userMessage}"`;
  }
}
