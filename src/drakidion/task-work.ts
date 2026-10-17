// DRAKIDION work product
// A task's `work` is a list of lines. Every step appends its result; a step never replaces
// what an earlier step wrote, so the list is the chain's trace (D-18).

/**
 * The most recent line of a work product, or '' when no step has produced one
 */
export const latestWork = (work: string[]): string => {
  if (work.length === 0) {
    return '';
  }

  return work[work.length - 1];
};
