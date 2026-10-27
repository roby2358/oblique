// What to do with a distribution
//
// Jev answers a choice question with a weight per label, and both gates that ask it one draw
// from those weights rather than taking the heaviest: which register to answer in (D-27), and
// which post in the feed to answer (D-28). The walk is the same both times, so it lives here
// once and each gate brings its own menu and its own answer for an empty draw.

/** How many of the heaviest weights a note keeps. Enough to see a close call in. */
export const NOTED_WEIGHTS = 3;

/**
 * Draw one label from `probabilities`, weighted by it, or `null` when there is nothing to draw.
 *
 * A label `isKnown` rejects is ignored rather than trusted: the gate that asked the question
 * owns the menu, and a label it does not recognize is a Jev that answered some other question.
 * The weights need not sum to one — the total is whatever the recognized labels come to — so a
 * menu that was partly understood still draws from the part that was.
 *
 * `random` is consumed only when there is something to draw, so a caller that falls back to
 * its own draw gets the number this one did not use.
 */
export const drawLabel = (
  probabilities: { [label: string]: number } | undefined,
  isKnown: (label: string) => boolean,
  random: () => number
): string | null => {
  const weights = Object.entries(probabilities ?? {})
    .filter(([label, weight]) => isKnown(label) && weight > 0);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);

  if (total <= 0) {
    return null;
  }

  let drawn = random() * total;

  for (const [label, weight] of weights) {
    drawn -= weight;

    if (drawn < 0) {
      return label;
    }
  }

  // Only reachable through floating-point drift at the very top of the range
  return weights[weights.length - 1][0];
};

/**
 * The heaviest `NOTED_WEIGHTS` weights, for the line a gate leaves behind about how it chose.
 * Every label is kept as Jev gave it, including ones the menu did not offer, because a gate
 * reporting an answer it ignored is exactly what someone reading the note needs to see.
 */
export const describeWeights = (probabilities: { [label: string]: number } | undefined): string => {
  if (!probabilities) {
    return 'no distribution';
  }

  return Object.entries(probabilities)
    .sort(([, left], [, right]) => right - left)
    .slice(0, NOTED_WEIGHTS)
    .map(([label, weight]) => `${label} ${weight.toFixed(2)}`)
    .join(', ');
};
