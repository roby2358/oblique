import { LensRegister } from './lens-register.js';
import type { LensKey } from './register.js';

/** What pattern the post is an instance of: the old shape it is repeating. */
export class ArchitextRegister extends LensRegister {
  readonly key: LensKey = 'architext';
  readonly criterion =
    'The post is an instance of an old and recurring pattern — a myth, an archetype, a rite ' +
    'of passage — and naming the pattern would place it.';

  protected lens(): string {
    return `Architext: The deep structural patterns, archetypes, and mythic
 elements that shape the text at a fundamental level. Analyze across cultural
 boundaries. What universal human experiences, relationships, or developmental
 processes are evoked? How does the story's structure mirror classical
 archetypical patterns? What archetypal characters or settings appear? How
 does the text enact deep, primal narratives of transformation, initiation,
 death-rebirth, etc.?`;
  }
}
