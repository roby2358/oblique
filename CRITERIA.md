# Oblique — Criteria

How we know Oblique is correct, usable and good. Every rule in `ONTOLOGY.md` owns a row here;
every row carries an **Instrument** that says, honestly, how it is checked.

The Instrument column is the row's status and is always exactly one of:

- `automated` — tests exist and run under `npm test`;
- `manual — <what a human checks>`;
- `not yet covered` — a known gap, no test;
- `retired` — a tombstone. The ID is never reused.

IDs are never renumbered. Rules are cited by ID, never by section number.

---

## R — Rules (automated)

| ID | Given | Expect | Instrument |
|---|---|---|---|
| R-1 | `newReadyTask(d)` / `newWaitingTask(d)`, then `nextTask` applied twice | First snapshot has a fresh 24-char `taskId`, `version` 1, status `ready`/`waiting`, `createdAt` set. Successors reuse the `taskId`, carry versions 2 then 3, preserve `createdAt`, and inherit `work` and `conversation`. Two calls to the same factory never collide on `taskId`. | automated |
| R-2 | `addTask` with a snapshot of each status | `ready` lands in TaskMap and TaskQueue; `waiting` in TaskMap and WaitingSet; `succeeded`, `dead`, `retry`, `canceled` in TaskMap only. Never in two structures at once. | automated |
| R-3 | `transitionTask(state, old, successor)` where `old` is queued, then where `old` is waiting | `old` is gone from both the queue and the waiting set before the successor is admitted; the successor is routed by its own status. | automated |
| R-4 | A queued `ready` task whose `process` returns a successor; an empty queue; a queued id with no TaskMap entry; a queued task whose status is not `ready`; a `process` that throws | Successor case transitions and reports `processed: true`. Empty queue reports `processed: false` without warning. Missing entry and wrong status warn and report `processed: false`. A throw records a `dead` snapshot at `version + 1` with the error appended to `work`, and still reports `processed: true`. | automated |
| R-5 | A queue of several tasks, each returning a terminal successor; then a queue whose head refuses | Drains to empty in FIFO order. A refusal breaks the loop rather than spinning on the same head. | automated |
| R-6 | `startLoop` on a fresh state; `startLoop` again while running; `stop()` then a further frame | At most one task per animation frame; the second call warns and returns a no-op `stop`; after `stop()`, `isRunning` is false and no further task is processed. | not yet covered |
| R-7 | `resumeWaitingTask` / `errorWaitingTask` for a waiting chain; for a `taskId` absent from TaskMap; the same callback twice; a late failure for a chain that already succeeded; a stale callback for a chain that has resumed into `ready` work | Waiting: the chain leaves the WaitingSet and the successor is routed by status. Absent: warns, clears any WaitingSet entry, leaves state otherwise unchanged. Every callback for a chain that is not waiting warns and changes nothing — the terminal snapshot keeps its version, status and `work`, and queued work stays queued. | automated |
| R-8 | Notifications: author in `ignoreList`; `quote` whose text omits the handle; `mention` on a post that already has replies; post data missing or of the wrong `$type`; a post with replies; a post with none | `false`, `false`, **`true`** (a mention is always answered), `false`, `false`, `true`. | automated |
| R-9 | Threads: empty; last author is a bot appearing 4 of the last 8; the same bot appearing 3 of 8; last author human appearing 6 of 8; length `THREAD_MAX_POSTS + 1`; a normal thread | `null`, `null`, the thread, the thread (humans are never attenuated), `null`, the thread. | automated |
| R-10 | `getHistory` for a `quote` notification; a notification with no `replyInfo.parent.uri`; a reply; each of those with the upstream fetch failing | Quote → `[quoted post, the quote]`; standalone → `[quoted?, the post]`; reply → ancestors oldest-first with the notification last, at most `THREAD_MAX_DEPTH` deep. Every failure degrades to `[{ author, text }]` and never throws. Alt texts are carried on every path. | automated |
| R-11 | `createObliqueConversation(thread)` for a multi-post thread, a single post, a post with alt texts, and `null` | Two messages (`system`, `user`); the last post becomes the reply target and the rest the history; each alt text appears as its own `  image:` line; `null` in yields `null` out. | automated |
| R-12 | `getRandomTextLens` over many calls; `getDailyModel` / `getDailyGender` with the clock pinned to several days; `getDailyModel` with `rotate` false, with a reordered list, and with an empty list | The lens varies across calls and is always one of the four. Model and gender are constant within a day and advance by one position per day, wrapping at `MODEL_ROTATION_SIZE` / `GENDER_ROTATION_SIZE`. With `rotate` false the model is always `models[0]`, whatever the list order. An empty list throws `No models configured` rather than returning a model. | automated |
| R-13 | LLM content with a `# Response` section; with the section wrapped in backticks; with no such section | Returns the trimmed section with backticks stripped; returns `null` when the header is absent. | not yet covered |
| R-14 | Text under `MAX_BLUESKY_REPLY_CHARS`; text over it ending in each of `. ! ? , : ; — – … (` and newline; text over it with no punctuation; punctuation at index 0; empty string. Separately: a model returning an over-long response then a short one; a model over-long on all `LLM_MAX_ATTEMPTS` | Short text is returned unchanged. Over-long text is cut at the last punctuation at or before `MAX_BLUESKY_REPLY_CHARS`, with the mark itself dropped; with no punctuation it is cut at `MAX_BLUESKY_REPLY_CHARS`; punctuation at index 0 falls through to the plain cut. The retry loop returns the first response under `REPLY_LENGTH_GATE` and truncates only after the last attempt. | automated |
| R-15 | `notificationReplyTo` for a message with `replyInfo.root`, and for one without | With `replyInfo`: root is the thread root, parent is the message. Without: both root and parent are the message itself. | not yet covered |
| R-16 | `createPostReplyTask(...).process()` with text, for a post that resolves and one that rejects; with a like that rejects; with `''`; with whitespace only; when `notificationReplyTo`, `like` or `post` throws synchronously | Text yields a `waiting` successor and nothing is claimed until Bluesky answers: the like is dispatched before the post, and on resolve the callback receives a `succeeded` successor one version later whose `work` is `Posted: <text> (<the URI Bluesky returned>)`. On reject the callback receives a `dead` successor with `work` prefixed `Failed to post:`. A rejected like is logged and the reply still succeeds. Blank text posts nothing and does not even like, yielding a `dead` successor with `work` `Failed to post: Refusing to post an empty reply`. A synchronous throw yields a `dead` successor, with no waiting snapshot. | automated |
| R-17 | The full reply chain v1 → v5 driven through the orchestrator | Every snapshot shares one `taskId`, with versions 1 … 5; sorting a chain's snapshots by version reproduces the execution trace; v2 and v4 are `waiting`, v1 and v3 are `ready`, v5 is terminal. | automated |
| R-18 | `createObliqueMessageTask` with a client that resolves, and one that rejects | Returns a `waiting` snapshot immediately. On resolve, `onComplete` receives a `succeeded` successor whose `work` is the extracted response and whose `conversation` gains the assistant turn. On reject, a `dead` successor whose `work` starts `Error:`. | automated |
| R-19 | `/config.json` complete; partial; absent; returning a non-OK status; containing malformed JSON. Separately, `initializeConfig` then `getConfig` | A complete file is returned exactly as written, with nothing added. A partial file stays partial — no field is filled in. The last three warn and yield `{}` rather than throwing, so the page still loads. `getConfig` returns what was loaded. | automated |
| R-20 | `ensureAuth` with no prior session; with a token expiring beyond `TOKEN_REFRESH_BUFFER_MS`; with one expiring inside it; a login that rejects; a session JWT with no `exp`, with a malformed payload, and with fewer than three segments | Logs in in cases 1 and 3, skips in case 2. A rejected login leaves `authenticated` false and `tokenExpiresAt` null. Each malformed-JWT case falls back to `TOKEN_DEFAULT_TTL` rather than throwing. | not yet covered |
| R-21 | `checkNotifications` with no Bluesky client; with no LLM client; with an empty batch; with a batch where some notifications pass R-8 and some do not; with `#mark-as-seen` checked | Each missing client reports its own reason and creates nothing. An empty batch creates nothing. Otherwise exactly one task per passing notification, with the created and filtered counts reported. `markNotificationsAsSeen` is called once for the batch, before the per-notification loop, and only when checked. | not yet covered |
| R-22 | `generateSafeBase32(n)`, `generateTaskId()`, `generateCorrelationId()` over many calls | Length `n` / `TASK_ID_LENGTH` / `TASK_ID_LENGTH`; every character is in `SAFE_BASE32_ALPHABET`; `l`, `1`, `o` and `0` never appear; a correlation id always begins `x`; collisions do not occur across a large sample. | automated |
| R-23 | TaskMap, TaskQueue and WaitingSet exercised through their `*Ops` modules | TaskMap keeps one snapshot per `taskId` and replaces on re-set; `getTasksByStatus` filters correctly; removing a missing key is a no-op. TaskQueue is FIFO, `peek` does not consume, `remove` is by value, `getAllTaskIds` returns a copy. WaitingSet rejects duplicates and tolerates removing an absent id. | automated |
| R-24 | `createTaskFromFunction(d, fn)` where `fn` returns a partial, returns `{}`, returns a custom status, throws an `Error`, and throws a non-`Error` | Returns a `ready` task. On success the partial is merged over a succeeded successor, but `taskId`, `version` and `doneAt` are never overridden and the status defaults to `succeeded`. On a throw the result is a `dead` successor with the message appended to `work`; a non-`Error` throw yields `Unknown error`. | automated |

| R-35 | `generateResponse` with a normal payload, checking the request body names the model, carries `reasoning: { enabled: false }` and that nothing logged contains the API key; with `choices: []`; with `content: null` and `finish_reason: length`; with whitespace-only content; with a non-OK status | The normal payload yields the content, model and usage, and the console sees the request body without the headers. Each of the next three throws `OpenRouter returned no content for model <model> (finish_reason: <reason>)` rather than returning `''`. A non-OK status throws `OpenRouter API error: <status> <body>`. | automated |

### Unbuilt rules

Each corresponds to an item in the "Not yet built" rule of `ONTOLOGY.md`. They are listed so
the gap is visible, not so it looks covered.

| ID | Given | Expect | Instrument |
|---|---|---|---|
| R-25 | A full state persisted and restored from IndexedDB, twice | Restoring twice yields identical state; `ready` tasks resume; no snapshot is acknowledged before it is persisted. | not yet covered |
| R-26 | A failing task under `MAX_ATTEMPTS`, and at it | Under: a `retry` snapshot with `retryCount + 1`, a `lastError`, and a `nextRunAt` set by exponential backoff with jitter. At: `dead`. | not yet covered |
| R-27 | A waiting snapshot whose external response never arrives | At timeout expiry the chain transitions to `retry` rather than waiting forever. Covers the leak described in the reply-chain rule. | not yet covered |
| R-28 | A queue holding tasks with mixed `priority` and `nextRunAt` | Dequeues by `(priority DESC, nextRunAt ASC)` and never returns a task whose `nextRunAt` is in the future. | not yet covered |
| R-29 | A queue driven past the backpressure threshold and back below it | Promotion halts above the threshold and resumes below it; the poll interval shortens under pressure and lengthens when idle. | not yet covered |
| R-30 | A transition from a terminal status, e.g. `succeeded → running` | Rejected rather than applied. | not yet covered |
| R-31 | A retry of a task that already posted | The idempotency fence suppresses the second post. | not yet covered |
| R-32 | Two tabs open, then the leader tab closes | Exactly one loop runs; non-leaders may submit but not process; leadership is reassigned on close. | not yet covered |
| R-33 | Terminal snapshots older than the TTL | Purged from both TaskMap and storage; non-terminal snapshots untouched. | not yet covered |

---

## U — Interface and readability

| ID | Criterion | Instrument |
|---|---|---|
| U-1 | The status line shows live queue and waiting counts, and they change within one animation frame of a task being processed. | manual — watch `#status` while sending a chat message |
| U-2 | The observer, queue and waiting panels each refresh on panel switch and on their refresh button, and list every task with its `taskId`, version, status and description. | manual — switch panels with tasks in flight |
| U-3 | A chain can be followed end to end in the UI by its `taskId` alone, in version order. | manual — send a message, then read the observer panel |
| U-4 | Posting with no API key configured shows the "no API key" notice and creates no task. | manual — blank `openrouter.apiKey` in `config.json`, reload, send |
| U-5 | Notification text rendered into the Bluesky panel is HTML-escaped; a post containing `<script>` renders as text. | manual — inspect a crafted notification |
| U-6 | While polling, the interval input is disabled and the countdown to the next check updates every second. | manual — start polling, watch `#next-check` |
| U-7 | The poll interval input clamps to `POLL_MIN_S`…`POLL_MAX_S` on change and on blur. | automated |
| U-8 | *Saving configuration from the Configure panel updates the running orchestrator without a reload.* | retired — the panel has no fields; `config.json` is the only source |
| U-9 | The Configure panel says where `config.json` lives and that it is gitignored, and offers nothing to type into. | manual — open the Configure panel |

---

## X — Experience and outcomes

Phrased so each can fail.

| ID | Criterion | Linked decision |
|---|---|---|
| X-1 | A reply reframes the post rather than answering it. Fails if a reader judges most of 20 sampled replies to be direct answers. | D-1 |
| X-2 | Replies stay inside `MAX_BLUESKY_REPLY_CHARS` without reading as cut off. Fails if more than 1 in 20 sampled replies ends mid-thought. | D-9 |
| X-3 | Restraint is the common case. Fails if, over a week of polling, the bot posts to more than half the notifications it sees. | D-6, D-7 |
| X-4 | Two Oblique-class bots in one thread stop within `BOT_ATTENUATION_LIMIT` exchanges. Fails on any observed unbounded loop. | D-7 |
| X-5 | The daily model rotation is perceptible: a reader comparing a week of replies can tell days apart. Fails if they cannot. | D-5 |
| X-6 | A deleted or missing upstream post never produces a visible error or a lost reply — it degrades to less context. Fails on any thrown error reaching the UI from the history path. | D-8 |

All six are unmeasured. None has an instrument, and none should be quoted as evidence for
anything until one exists.

---

## Status

**As of 2026-10-17.** `npm test` runs 17 suites, 165 tests, and passes, and `npx tsc --noEmit`
reports no errors. There is no build step to check.

### Not yet covered

R-6, R-13, R-15, R-20, R-21, and every unbuilt row R-25 … R-33.

R-15 and R-20 are the ones that matter most: reply threading and token refresh are the two
remaining places where a defect reaches Bluesky rather than the console. R-13 is cheap to
close. R-21 needs the poller's dependencies injected rather than imported.

### Partial coverage

- **R-10** — the quote and single-post branches are covered through
  `getQuotedHistory`/`getOnePostHistory`, and the threaded branch through `getThreadHistory`.
  The `getHistory` dispatcher that chooses between them is exercised only indirectly, and the
  `THREAD_MAX_DEPTH` cap itself is not asserted.
- **R-12** — the list, the `rotate` pin and the empty-list error are covered; the day-to-day
  advance is covered only through `dailyCircularKey` with a pinned clock, not through
  `getDailyModel` itself. The claim that the rotation is *perceptible* is X-5 and is unmeasured.
- **R-14** — `truncateAtLastPunctuation` is covered in detail. The retry loop around it is not:
  nothing asserts that a short second response is accepted, nor that truncation happens only
  on the final attempt. One existing test is named "should use default maxLength of 279" while
  `MAX_BLUESKY_REPLY_CHARS` is 299; the name is stale, not the assertion.
- **R-17** — the integration test follows the chain to v3 and stops there; it does not process
  the post task, so the `waiting` v4 and the terminal v5 are covered only by R-16.
- **R-18** — construction and the resolve path are covered; the reject path is not.
- **R-21** — only the polling *toggle* handler and the interval clamp (U-7) are covered;
  `checkNotifications` itself is not.
- **R-23** — WaitingSet is tested through `src/drakidion/waiting-map.ts`, a byte-identical
  duplicate of `waiting-set.ts` that nothing else imports. The module the orchestrator actually
  uses is covered only transitively. See `ARCHITECTURE_LOG.md`.

### Manual only

U-1 … U-6 and U-9. There is no browser-driving script committed, so none of them runs in CI
and all of them are checked by opening the page.

### Conventions not yet adopted

Tests are organized by source file, not by criterion. There are no `test/R-n/` directories and
no coverage test asserting that every `automated` row has one, so a row could claim coverage
it does not have and nothing would catch it. Adopting the convention is a separate change.

### Retired

- **U-8** — the Configure panel's save. The panel no longer has fields to save; `config.json`
  is the only source of configuration. The ID is not reused.
