import { Register } from './register.js';
import type { RegisterKey } from './register.js';
import { ADVERTISED_REPLY_CHARS } from '../reply-length.js';

/**
 * Not a lens but a reframing: the poem does not analyze the post from an angle, it says the
 * same thing in a form that carries what analysis would flatten. Which is why it extends
 * `Register` directly rather than `LensRegister` — nothing about looking through a lens
 * applies to it (D-27).
 */
export class PoemRegister extends Register {
  readonly key: RegisterKey = 'poem';
  readonly criterion =
    'The post is carrying a feeling or an image that would be flattened by being explained, ' +
    'and is better answered in a form than in an argument.';

  protected framing(): string {
    return `Answer this one as a poem.

  Not a commentary on the post and not a decoration of it: take what the post is carrying and
  put it in an image that holds it. The poem is the whole reply. Say nothing around it.`;
  }

  protected rules(): string {
    return `Rules for this reply:
- One stanza. No title, no preamble, no explanation after it.
- Four lines or fewer, each short, separated by single newlines.
- The whole stanza must be ${ADVERTISED_REPLY_CHARS} characters or less, counting the line breaks.
- Concrete images over abstractions. No rhyme unless it arrives on its own.
- It must be about this post, in this thread. A poem that would fit any post is a failure.
- Do not name the form. Do not say "a poem for you" or anything like it.`;
  }
}
