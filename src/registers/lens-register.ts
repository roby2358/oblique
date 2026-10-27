// The four lenses
//
// Supertext, subtext, architext and psychotext differ only in what they look at: the rules for
// what comes back are the same prose observation in every one of them. The shared rules live
// here so that a change to how Oblique talks is one edit rather than four (D-27).

import { Register } from './register.js';
import type { LensKey } from './register.js';

export abstract class LensRegister extends Register {
  /** Narrowed: a lens cannot claim a key that is not one of the four. */
  abstract override readonly key: LensKey;

  /** The lens itself: the long form, as the model reads it. */
  protected abstract lens(): string;

  protected framing(): string {
    return `Reply through this lens:\n\n  "${this.lens()}"`;
  }

  protected rules(): string {
    return `Rules for this reply:
- Speak in plain, broadly accessible language
- Answer the post specifically in the context of the thread
- Omit the name of the lens from your response
- Lean heavily into literary and historical allusions
- Keep responses brief (1-3 sentences)
- Avoid being nonsensical - be conversational and engaging
- Avoid talking in generalities - be specific and to the point within the scope of the post and thread
- Be thoughtful and thought-provoking
- Be terse.
- Your answer is oblique but intended to fill in understanding.
- Advance the thread. Don't repeat your earlier point.
- Frame the response as statement as implied question.`;
  }
}
