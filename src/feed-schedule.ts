// When to look at the feed
//
// Not a second timer. The notification poller is the only clock on the page, and a look at the
// feed is a thing that happens at the end of some of its passes: one switch arms the whole
// bot, there is no second interval to start, stop or fall out of step with, and someone who
// addressed Oblique is always answered before a stranger who did not (D-28).

/** The shortest a look can be from the one before it. */
export const FEED_MIN_MIN = 80;

/** How much later than that a look can fall. The interval is uniform across the span. */
export const FEED_SPREAD_MIN = 80;

const MINUTE_MS = 60 * 1000;

/**
 * When the next look falls due, drawn once.
 *
 * Drawing the interval **here**, at the reset, rather than drawing a fresh threshold to
 * compare against on every pass, is the whole of this function. A threshold re-drawn each pass
 * is the minimum of many draws rather than one draw: with a two-minute poll and a target meant
 * to average two hours, the low draws keep winning — the median lands far below the target and
 * the upper half of the intended range is never reached at all. Drawn once, the interval is
 * uniform over [FEED_MIN_MIN, FEED_MIN_MIN + FEED_SPREAD_MIN) as intended (D-28).
 *
 * The poll interval then quantizes it: a due time lands on the next pass after it, so the
 * interval is a floor and not a schedule. Invisible at POLL_DEFAULT_S. At POLL_MAX_S a look
 * waits for the next hourly pass, which adds up to an hour to the interval rather than setting
 * it, now that the floor is longer than an hour.
 */
export const nextLookAt = (now: number, random: () => number): number => {
  return now + (FEED_MIN_MIN + random() * FEED_SPREAD_MIN) * MINUTE_MS;
};

/**
 * One due time per account, because each network has its own timeline and its own audience: a
 * clock shared between them would hand the second network half the attention for no reason,
 * and the two are drawn independently so they do not fall into step.
 *
 * An account's first sight **arms** its clock rather than firing it. Otherwise a page load
 * would open with an unsolicited post, and so would every reload after it — which is the
 * state a long debugging session leaves the page in over and over.
 */
export class FeedSchedule {
  private dueAt = new Map<string, number>();

  constructor(private random: () => number) {}

  /** Whether this account's feed is due a look, arming the clock the first time it is asked. */
  isDue(handle: string, now: number): boolean {
    const due = this.dueAt.get(handle);

    if (due === undefined) {
      this.dueAt.set(handle, nextLookAt(now, this.random));
      return false;
    }

    return now >= due;
  }

  /**
   * Start the interval again.
   *
   * Called after every look, whatever the look produced. A look that qualified nothing, drew
   * `none`, failed its verification or chose silence has still spent the bot's attention on
   * the feed, and the alternative is a second number saying how soon to retry a quiet
   * timeline — carried to save one timeline read and one Jev call, which are the two cheapest
   * things the page does (D-28).
   */
  reset(handle: string, now: number): void {
    this.dueAt.set(handle, nextLookAt(now, this.random));
  }

  /** When this account's next look falls due, for the status line. */
  dueFor(handle: string): number | undefined {
    return this.dueAt.get(handle);
  }
}
