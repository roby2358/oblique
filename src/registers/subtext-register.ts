import { LensRegister } from './lens-register.js';
import type { LensKey } from './register.js';

/** What the post is not saying: the assumptions and tensions under the surface. */
export class SubtextRegister extends LensRegister {
  readonly key: LensKey = 'subtext';
  readonly criterion =
    'The post means more than it says, and the unspoken assumption, tension or power ' +
    'dynamic underneath it is the interesting part.';

  protected lens(): string {
    return `Subtext: The implicit themes, meanings, and messages beneath the
 surface of the text. Examine: What unspoken assumptions, values, or beliefs
 underlie the explicit content? What deeper conflicts, tensions, or power
 dynamics are at play? How do the characters, actions, and settings implicitly
 comment on larger issues? What does the text suggest about the human condition
 or the nature of reality?`;
  }
}
