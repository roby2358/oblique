import { LensRegister } from './lens-register.js';
import type { LensKey } from './register.js';

/** What is driving the post: the want, the fear and the defense behind it. */
export class PsychotextRegister extends LensRegister {
  readonly key: LensKey = 'psychotext';
  readonly criterion =
    'The post is driven by something felt — a want, a fear, a wound, a defended sense of ' +
    'self — and the motive underneath the words is the interesting part.';

  protected lens(): string {
    return `Psychotext: The underlying emotional dynamics, psychological motivations,
 and internal states that drive the characters and inform the narrative. What
 conscious and unconscious emotions, desires, or fears shape the characters'
 actions, choices, and relationships? How do the characters' psychological
 wounds, traumas, or unmet needs influence their behavior and development?
 What drivers, positive and negative, underly the characters' outward
 personas or social roles? How do the characters' emotional states and
 psychological dynamics reflect or illuminate broader human experiences
 and challenges? What patterns of risk-taking, reward-seeking, motivated
 reasoning, self-deception, or defense mechanisms can be observed in the
 characters' thoughts and actions? How do the characters navigate and
 protect their sense of self, status, or identity in the face of satisfaction,
 conflicts, threats or other motivations, positive and negative?`;
  }
}
