import { Register } from './register.js';
import type { RegisterKey } from './register.js';

/**
 * The whole reply in one sentence. The lenses already ask for brevity, but they ask for it
 * alongside allusion and implication; this asks for the plain line that lands and then stops.
 */
export class OnelinerRegister extends Register {
  readonly key: RegisterKey = 'oneliner';
  readonly criterion =
    'The post is light, funny, or already complete in itself, and the right answer is one ' +
    'clean line rather than anything that digs.';

  protected framing(): string {
    return `Answer this one with a single line.

  The post does not need opening up. It needs one clean sentence that lands and then stops.`;
  }

  protected rules(): string {
    return `Rules for this reply:
- Exactly one sentence. Not two short ones.
- Plain language. No allusion, no lens, no analysis, no hedging.
- Dry over clever. If it reads as a punchline reaching for a laugh, cut it back.
- Specific to this post. A line that would fit any post is a failure.
- No preamble, no sign-off, no emoji.`;
  }
}
