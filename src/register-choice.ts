// The third gate: how to answer
//
// The first two gates ask whether a notification and its thread should be answered at all.
// This one is asked only once they have both passed, and it asks something different: given
// that Oblique is going to answer, what should the answer be? It is a judgment about the
// post rather than a rule about it, so it is put to Jev rather than written as a condition
// (D-27).
//
// Jev is a System One model: it reads state and answers a typed question with a distribution.
// It is given the raw thread and nothing of Oblique's voice, mission or output format — the
// decision is better for being made by something that has not already been talked into a
// register.

import type { JevClient, JevChoiceQuestion } from './hooks/jev/jev-client.js';
import type { Register } from './registers/index.js';
import { registerMenu, sampleRegister, randomLensRegister } from './registers/index.js';
import { describeWeights } from './weighted-draw.js';

/** The name this question answers to. For code only; Jev never sees it. */
export const REGISTER_QUESTION = 'register';

/**
 * What Jev is looking at. Deliberately short: the menu carries the meaning of each option, and
 * every sentence spent here is one Jev reads before every decision.
 */
const CONTEXT =
`Oblique is a bot on a social network. It answers a post once, briefly, and then leaves.
It is read by the person who wrote the post and by anyone following the thread.`;

const INSTRUCTIONS =
`Oblique is going to answer the post below. Decide what that answer should be: which of these
would do the most for the person who wrote it, and for anyone reading the thread?`;

/** The question put to Jev, menu and all. */
export const registerQuestion = (): JevChoiceQuestion => ({
  type: 'choice',
  instructions: INSTRUCTIONS,
  criteria: registerMenu(),
});

/**
 * The state the question is asked against: context, then the thread, then the post being
 * answered, in that order — oldest and least specific first, so the thing to be judged is the
 * last thing read.
 */
export const registerState = (threadHistory: string, userMessage: string): string[] => [
  CONTEXT,
  `Thread so far:\n\n${threadHistory || '(nothing; this is the start of the thread)'}`,
  `The post to answer:\n\n${userMessage}`,
];

/** A register and how it was arrived at, so the chain can say which in its work. */
export interface RegisterChoice {
  register: Register;
  note: string;
}

/**
 * Ask Jev which register to answer in, and draw one from its answer.
 *
 * Every way this can fail ends in a lens, because the register is a refinement and the reply
 * is the product: an unconfigured key, a dead endpoint, a malformed answer or a menu Jev did
 * not recognize all leave Oblique answering the way it did before this gate existed. The
 * reason lands in the note, so a fallback is visible in the chain's work rather than looking
 * like an ordinary draw (D-27).
 */
export const chooseRegister = async (
  jevClient: JevClient | undefined,
  threadHistory: string,
  userMessage: string,
  random: () => number
): Promise<RegisterChoice> => {
  if (!jevClient || !jevClient.isConfigured()) {
    return {
      register: randomLensRegister(random),
      note: 'drawn from the lenses: Jev is not configured',
    };
  }

  try {
    const answers = await jevClient.decide({
      state: registerState(threadHistory, userMessage),
      questions: { [REGISTER_QUESTION]: registerQuestion() },
    });

    const answer = answers[REGISTER_QUESTION];
    const register = sampleRegister(answer?.probabilities, random);

    return {
      register,
      note: `drawn from Jev (${describeWeights(answer?.probabilities)})`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';

    console.warn(`Jev could not choose a register: ${reason}`);

    return {
      register: randomLensRegister(random),
      note: `drawn from the lenses: Jev failed (${reason})`,
    };
  }
};
