// The feed gate: which post to answer, if any
//
// The register gate asks how to answer a post that has already arrived. This one asks
// something Oblique never used to ask at all: of the posts going past, is any of them worth
// speaking to? Nobody here has addressed the bot, so the restraint that matters most is the
// restraint to say nothing, and `none` sits on the menu beside the posts for exactly that
// reason — a choice question must choose something, so the option of choosing nothing has to
// be one of the options (D-28).
//
// Jev is given the posts and a short word about what answering one would mean, and nothing of
// Oblique's voice, mission or output format. Which register the reply lands in is a later
// question, asked by a later gate about the one post that won this one.

import type { FeedCandidate } from './hooks/bluesky/bluesky-client.js';
import type { JevClient, JevChoiceQuestion } from './hooks/jev/jev-client.js';
import { drawLabel, describeWeights } from './weighted-draw.js';

/** The name this question answers to. For code only; Jev never sees it. */
export const FEED_QUESTION = 'post';

/** The option that answers nothing. Not a post, so it can never collide with a label. */
export const NO_PICK = 'none';

/**
 * How many qualified posts are offered. Cost is not the constraint — fifteen posts is a small
 * fraction of Jev's context, and Jev is the cheapest call here by an order of magnitude. The
 * constraint is whether the answer means anything: spread across too many near-equivalent
 * posts, a distribution stops being a judgment and becomes noise (D-28).
 */
export const FEED_CANDIDATES = 15;

/**
 * What Jev is looking at. Short on purpose, like the register gate's: the menu carries the
 * posts, and every sentence here is one Jev reads before every look.
 */
const CONTEXT =
`Oblique is a bot on a social network. It answers a post once, briefly, and then leaves.
Nobody below has addressed it: these posts are going past in its feed, and it may answer one
of them or none of them. Most posts are better left alone.`;

const INSTRUCTIONS =
`You have excellent theory of mind.
Which of these posts would most repay a brief, lateral reply from a stranger — a reply that
reframes the post rather than agreeing with it, answering it, or being helpful about it?
Choose none of them if none of them would.`;

const NO_PICK_CRITERION =
`None of these posts should be answered. Choose this when the posts are routine, private
between people who already know each other, complete as they stand, or simply not interesting
enough to be worth a stranger's reply. This is the right answer more often than not.`;

/** The label a candidate answers to, by its place in the menu. For code only. */
export const candidateLabel = (index: number): string => `p${index + 1}`;

/** The menu as Jev reads it: a label per post, then the option of answering none of them. */
export const feedMenu = (candidates: FeedCandidate[]): { [label: string]: string } => {
  const menu: { [label: string]: string } = {};

  candidates.forEach((candidate, index) => {
    menu[candidateLabel(index)] = `@${candidate.message.author}: ${candidate.message.text}`;
  });

  menu[NO_PICK] = NO_PICK_CRITERION;

  return menu;
};

/** The question put to Jev, posts and all. */
export const feedQuestion = (candidates: FeedCandidate[]): JevChoiceQuestion => ({
  type: 'choice',
  instructions: INSTRUCTIONS,
  criteria: feedMenu(candidates),
});

/**
 * The state the question is asked against. The posts are the options rather than the evidence
 * here, so they live in the menu and the state is only the standing context.
 */
export const feedState = (): string[] => [CONTEXT];

/** A post to answer, or none, and how that was arrived at, so the pass can say so. */
export interface FeedChoice {
  candidate: FeedCandidate | null;
  note: string;
}

/**
 * Ask Jev which post in the feed to answer, and draw one from its answer.
 *
 * Every way this can fail ends in **no post**, which is the opposite of how the register gate
 * fails and is deliberate. There, a reply was already owed and the register was a refinement,
 * so a broken Jev falls back to a lens. Here nothing is owed to anyone: a Jev that is absent,
 * unreachable or incoherent is not a reason to pick a stranger's post at random, which is the
 * exact failure G-2 exists to prevent. No judgment, no unsolicited reply (D-28).
 *
 * `choice` is ignored and only `probabilities` is read, as at the register gate: a look that
 * comes back with no distribution costs this pass and nothing else.
 */
export const chooseFeedPost = async (
  jevClient: JevClient | undefined,
  candidates: FeedCandidate[],
  random: () => number
): Promise<FeedChoice> => {
  if (candidates.length === 0) {
    return { candidate: null, note: 'no post: nothing in the feed qualified' };
  }

  if (!jevClient || !jevClient.isConfigured()) {
    return { candidate: null, note: 'no post: Jev is not configured' };
  }

  const offered = candidates.slice(0, FEED_CANDIDATES);
  const byLabel = new Map(offered.map((candidate, index) => [candidateLabel(index), candidate]));

  try {
    const answers = await jevClient.decide({
      state: feedState(),
      questions: { [FEED_QUESTION]: feedQuestion(offered) },
    });

    const answer = answers[FEED_QUESTION];
    const label = drawLabel(
      answer?.probabilities,
      candidate => candidate === NO_PICK || byLabel.has(candidate),
      random
    );
    const drawn = `drawn from Jev of ${offered.length} (${describeWeights(answer?.probabilities)})`;
    const candidate = label === null ? undefined : byLabel.get(label);

    // `none` won, or there was no distribution to draw from at all
    if (!candidate) {
      return { candidate: null, note: `no post: ${drawn}` };
    }

    return { candidate, note: drawn };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';

    console.warn(`Jev could not choose a post from the feed: ${reason}`);

    return { candidate: null, note: `no post: Jev failed (${reason})` };
  }
};
