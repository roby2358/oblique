import { Register } from './register.js';
import type { RegisterKey } from './register.js';

/**
 * Say nothing. The like is the whole answer.
 *
 * Silence is a register rather than a restraint rule because it is a judgment about what this
 * post deserves, not about whether the rules permit a reply — the gates have already passed by
 * the time it is chosen. It is the only register with nothing to write, so it has no prompt at
 * all and `prompt` throws rather than returning an empty one: a caller that reaches it has
 * skipped the `postable` check, and an empty prompt would be found much later (D-27).
 */
export class SilenceRegister extends Register {
  readonly key: RegisterKey = 'silence';
  readonly postable = false;
  readonly criterion =
    'The post needs no reply at all — it is a thank you, a goodbye, a private moment, a joke ' +
    'that is finished, or something that would be cheapened by a bot having a thought about it.';

  protected framing(): string {
    return '';
  }

  protected rules(): string {
    return '';
  }

  override prompt(): string {
    throw new Error('The silence register has no prompt: check `postable` before building one');
  }
}
