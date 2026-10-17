// Reply length limits. One home for both numbers, because they only make sense together.

// The ceiling the code enforces. Bluesky's own post limit is 300 graphemes.
export const MAX_BLUESKY_REPLY_CHARS = 300;

// The limit the model is told. Models count characters badly, so we ask for less than we
// allow and let the margin absorb the overshoot; the retry loop catches the rest.
export const ADVERTISED_REPLY_CHARS = 290;
