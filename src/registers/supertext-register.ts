import { LensRegister } from './lens-register.js';
import type { LensKey } from './register.js';

/** What the post is made of: the works, genres and tropes it is speaking through. */
export class SupertextRegister extends LensRegister {
  readonly key: LensKey = 'supertext';
  readonly criterion =
    'The post is in conversation with other stories, genres, works or cultural references, ' +
    'and naming what it is echoing would open it up.';

  protected lens(): string {
    return `Supertext: The intertextual elements and cultural allusions present
 in the work. Consider: What other literary works, genres, or tropes does this
 text reference or evoke? How does it situate itself within broader cultural
 narratives or discourses? What external symbols, figures, or ideas does
 it draw upon to create meaning?`;
  }
}
