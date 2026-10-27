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
| R-4 | A queued `ready` task whose `process` returns a successor; an empty queue; a queued id with no TaskMap entry; a queued task whose status is not `ready`; a `process` that throws | Successor case transitions and reports `processed: true`. Empty queue reports `processed: false` without warning. Missing entry and wrong status warn and report `processed: false`. A throw records a `dead` snapshot at `version + 1` with the error appended to `work` as a further line, and still reports `processed: true`. | automated |
| R-5 | A queue of several tasks, each returning a terminal successor; then a queue whose head refuses | Drains to empty in FIFO order. A refusal breaks the loop rather than spinning on the same head. | automated |
| R-6 | `startLoop` on a fresh state; `startLoop` again while running; `stop()` then a further frame | At most one task per animation frame; the second call warns and returns a no-op `stop`; after `stop()`, `isRunning` is false and no further task is processed. | not yet covered |
| R-7 | `resumeWaitingTask` / `errorWaitingTask` for a waiting chain; for a `taskId` absent from TaskMap; the same callback twice; a late failure for a chain that already succeeded; a stale callback for a chain that has resumed into `ready` work | Waiting: the chain leaves the WaitingSet and the successor is routed by status. Absent: warns, clears any WaitingSet entry, leaves state otherwise unchanged. Every callback for a chain that is not waiting warns and changes nothing — the terminal snapshot keeps its version, status and `work` lines, and queued work stays queued. | automated |
| R-8 | Notifications: each of `mention`, `reply`, `quote` and each of `like`, `repost`, `follow`, `starterpack-joined` through `isRepliableNotification`; each reason through `needsPostData`; a `like` through `notificationRestraintReason` with post data and with none; author in `ignoreList`; `quote` whose text omits the handle it is told; `mention` on a post that already has replies; post data missing or of the wrong `$type`; a top-level post with replies; a reply with replies; a post with none; the same declined notification from two different authors. Separately `postUnreadableReason` for a thread view post, a `#notFoundPost`, a `#blockedPost`, a missing thread and an unhandled `$type` | The first three reasons are repliable and the rest are not, and of those three only a `reply` and a `quote` need the post — a `mention` is answered whatever it says. A `like` is declined whatever the post data says, because its `uri` names no post. Then a reason each for the ignore list and the unnamed quote (tested against the handle passed in, not a configured one), **`null`** for a mention, the unreadable reason passed through unchanged, then R-52's answer passed through: **`null`** for a top-level post however many replies it carries, a reason for a reply someone answered, and `null` for a post with none. Every reason is identical for two different authors, so a pass can tally them. `postUnreadableReason` returns `null` for a readable post and otherwise names which of the four it was, rather than reporting every one of them as deleted. The same four answers come back for `town.delve.feed.defs#…` as for `app.bsky.feed.defs#…`, and a `$type` with no fragment is unreadable rather than a crash. | automated |
| R-9 | `threadRestraintReason` for threads: empty; last author is a bot appearing `BOT_ATTENUATION_LIMIT` of the last `BOT_WINDOW`; the same bot appearing one fewer; last author human appearing 6 of 8; length `THREAD_MAX_POSTS + 1`; a normal thread | A reason, a reason, `null`, `null` (humans are never attenuated), a reason, `null`. The attenuation reason names the author and both counts, and the over-length reason names the length, because each becomes the last work line of the chain it declines. | automated |
| R-10 | `getHistory` for a `quote` notification; a notification with no `replyInfo.parent.uri`; a reply; each of those with the upstream fetch failing | Quote → `[quoted post, the quote]`; standalone → `[quoted?, the post]`; reply → ancestors oldest-first with the notification last, at most `THREAD_MAX_DEPTH` deep. Every failure degrades to `[{ author, text }]` and never throws. Alt texts are carried on every path. | automated |
| R-11 | `createObliqueConversation(thread, register)` for a multi-post thread, a single post, a post with alt texts, and `null` | Two messages (`system`, `user`); the last post becomes the reply target and the rest the history; each alt text appears as its own `  image:` line; `null` in yields `null` out. | automated |
| R-12 | `getDailyModel` / `getDailyGender` with the clock pinned to several days; `getDailyModel` with `rotate` false, with a reordered list, and with an empty list | Model and gender are constant within a day and advance by one position per day, wrapping at `MODEL_ROTATION_SIZE` / `GENDER_ROTATION_SIZE`. With `rotate` false the model is always `models[0]`, whatever the list order. An empty list throws `No models configured` rather than returning a model. The per-reply draw is R-47. | automated |
| R-13 | LLM content with a `# Response` section; with the section wrapped in backticks; with no such section | Returns the trimmed section with backticks stripped; returns `null` when the header is absent. | not yet covered |
| R-14 | Text at or under `MAX_BLUESKY_REPLY_CHARS`; text over it ending in each of `. ! ? , : ; — – … (` and newline; text over it with no punctuation; punctuation at index 0; empty string. Separately: a model returning an over-long response then a short one; a model over-long on all `LLM_MAX_ATTEMPTS` | Short text is returned unchanged. Over-long text is cut at the last punctuation at or before `MAX_BLUESKY_REPLY_CHARS`, with the mark itself dropped; with no punctuation it is cut at `MAX_BLUESKY_REPLY_CHARS`; punctuation at index 0 falls through to the plain cut. The retry loop returns the first response at or under `MAX_BLUESKY_REPLY_CHARS` and truncates only after the last attempt. | automated |
| R-15 | `notificationReplyTo` for a message with `replyInfo.root`, and for one without | With `replyInfo`: root is the thread root, parent is the message. Without: both root and parent are the message itself. | not yet covered |
| R-16 | `createPostReplyTask(...).process()` with text, for a post that resolves and one that rejects; with a like that rejects; with `''`; with whitespace only; when `notificationReplyTo`, `like` or `post` throws synchronously | Text yields a `waiting` successor and nothing is claimed until Bluesky answers: the like is dispatched before the post, and on resolve the callback receives a `succeeded` successor one version later whose `work` is the reply text plus an appended line `Posted: <the URI Bluesky returned>`. On reject the callback receives a `dead` successor whose appended `work` line is prefixed `Failed to post:`. A rejected like is logged and the reply still succeeds. Blank text posts nothing and does not even like, yielding a `dead` successor whose appended `work` line is `Failed to post: Refusing to post an empty reply`. A synchronous throw yields a `dead` successor, with no waiting snapshot. | automated |
| R-17 | The full reply chain v1 → v5 driven through the orchestrator; separately `createReplyTask` alone, for a notification with text and one without | Every snapshot shares one `taskId`, with versions 1 … 5; sorting a chain's snapshots by version reproduces the execution trace, which `work` carries too — every step appends and nothing overwrites, so the posting snapshot carries v1's line, v2's, the register the gate drew and the reply text; v2 and v4 are `waiting`, v1 and v3 are `ready`, v5 is terminal. v1 states its own fields over the factory base: `work` is `['<thinking>']` and `conversation` is the notification text as a single `user` message, or the fallback text when the notification has none. | automated |
| R-18 | `createObliqueMessageTask` with a client that resolves, and one that rejects | Returns a `waiting` snapshot immediately. On resolve, `onComplete` receives a `succeeded` successor whose `work` gains the extracted response as its last line and whose `conversation` gains the assistant turn. On reject, a `dead` successor whose appended `work` line starts `Error:`. | automated |
| R-19 | `/config.json` complete; partial; absent; returning a non-OK status; containing malformed JSON. Separately, `initializeConfig` then `getConfig` | A complete file is returned exactly as written, with nothing added. A partial file stays partial — no field is filled in. The last three warn and yield `{}` rather than throwing, so the page still loads. `getConfig` returns what was loaded. | automated |
| R-20 | `ensureAuth` with no prior session; with a token expiring beyond `TOKEN_REFRESH_BUFFER_MS`; with one expiring inside it; a login that rejects. Separately `authenticate` for a session JWT with a valid `exp`, with no `exp`, with a payload that is not JSON, with fewer than three segments, with no `accessJwt` at all and with no session at all; and `TOKEN_DEFAULT_TTL` against a real token's life | Logs in in cases 1 and 3, with that account's own handle and password, and skips in case 2. A rejected login reaches the caller and leaves `authenticated` false and `tokenExpiresAt` null. A valid `exp` is used as given; every other reading falls back to `TOKEN_DEFAULT_TTL` from now rather than throwing. The fallback is shorter than a real two-hour token, so a wrong guess costs a login rather than silence, and longer than `TOKEN_REFRESH_BUFFER_MS`, so it does not cost a login per call. | automated |
| R-44 | `isUnauthorizedError` for a 401, a 400 carrying `ExpiredToken`, a 400 `InvalidRequest`, a 501, a plain `Error`, `null`, and a bare `{ status: 401 }`. Separately a read (`getNotifications`) and a write (`post`) refused once with a 401; a read refused twice; a read refused with a 501 | Only the 401 and the `ExpiredToken` are unauthorized, the bare object among them, because the status is read rather than the error class tested. A first refusal signs in again and repeats the call unchanged, and the caller gets the answer it would have had — the retried write carries the same record. A second refusal reaches the caller, with no second login. A 501 reaches the caller with no login at all. | automated |
| R-43 | `checkAccount` on a batch holding one `mention`, one `follow` and one `like`; `tallyReasons` on a list repeating one reason three times among others, and on an empty list | The mention alone is `answered` and earns the one task; the other two become `declined` reasons in batch order, and the post is never fetched for any of them. `tallyReasons` returns one row per distinct reason with its count, commonest first, and nothing at all for a pass that declined nothing. | automated |
| R-21 | `checkNotifications` with no account configured; with no LLM client; with an empty batch; with a batch where some notifications pass R-8 and some do not; with `#mark-as-seen` checked. Separately `fetchPostData` with a client that resolves and one that rejects | Each missing dependency reports its own reason and creates nothing. Every configured account is visited and its tasks all land in the one queue. An empty batch creates nothing. Otherwise exactly one task per passing notification, with the created and filtered counts reported. `markNotificationsAsSeen` is called once for the batch, before the per-notification loop, and only when checked. `fetchPostData` returns what Bluesky gives it, and `null` rather than throwing when the fetch fails, so one notification's failure cannot abort the batch. | not yet covered |
| R-22 | `generateSafeBase32(n)`, `generateTaskId()`, `generateCorrelationId()` over many calls | Length `n` / `TASK_ID_LENGTH` / `TASK_ID_LENGTH`; every character is in `SAFE_BASE32_ALPHABET`; `l`, `1`, `o` and `0` never appear; a correlation id always begins `x`; collisions do not occur across a large sample. | automated |
| R-23 | TaskMap, TaskQueue and WaitingSet exercised through their `*Ops` modules | TaskMap keeps one snapshot per `taskId` and replaces on re-set; `getTasksByStatus` filters correctly; removing a missing key is a no-op. TaskQueue is FIFO, `peek` does not consume, `remove` is by value, `getAllTaskIds` returns a copy. WaitingSet rejects duplicates and tolerates removing an absent id. | automated |
| R-24 | `createTaskFromFunction(d, fn)` where `fn` returns a partial, returns `{}`, returns a custom status, throws an `Error`, and throws a non-`Error` | Returns a `ready` task. On success the partial is merged over a succeeded successor, but `taskId`, `version` and `doneAt` are never overridden and the status defaults to `succeeded`. On a throw the result is a `dead` successor with the message appended to `work` as a further line; a non-`Error` throw yields `Unknown error`. | automated |
| R-35 | `generateResponse` with a normal payload, checking the request body names the model, carries `reasoning: { enabled: false }` and that nothing logged contains the API key; with `choices: []`; with `content: null` and `finish_reason: length`; with whitespace-only content; with a non-OK status | The normal payload yields the content, model and usage, and the console sees the request body without the headers. Each of the next three throws `OpenRouter returned no content for model <model> (finish_reason: <reason>)` rather than returning `''`. A non-OK status throws `OpenRouter API error: <status> <body>`. | automated |
| R-36 | A chain's `work` after each step; `latestWork` for a work product with lines and for one with none | Every step appends and leaves the earlier lines untouched, so the latest snapshot carries the whole trace. A step that makes a decision of its own appends for that too — the register gate, inside v2 — so the number of lines is not the number of versions. `latestWork` returns the last line, and `''` when there are none, so a caller's own fallback text applies. | automated |
| R-37 | `obliquePrompt` called twice with different messages and histories; `systemPrompt` | The sections appear in volatility order: the fixed mission text, the daily voice, the register, the thread history, the message being answered, the closing restatement. Everything above the voice is byte-identical between the two calls. The output format is stated in `systemPrompt` and nowhere else, and the restatement is the last thing in the user message. | automated |
| R-38 | `createAccounts` on a file with both sections filled in; one with a leading `@` on the handle; one whose second section is blank; one whose second section has only a handle; an empty file | One account per filled-in section, in `ACCOUNT_SECTIONS` order, each client carrying the `service`, `appview` and `lexicon` from its own section and each handle stripped of a leading `@`. The `atproto-proxy` header on each client's agent is the one its section names. A blank section yields no account and no warning; a half filled in one yields no account and a warning naming every missing field. An empty file yields no account at all. | automated |
| R-39 | `checkAccount` for an account whose `ensureAuth` rejects; for one whose batch is empty, with `#mark-as-seen` on | The rejection is returned as that account's `error` with no task and no throw, so the accounts after it are still checked. The empty batch returns no task, no error, and leaves `markNotificationsAsSeen` uncalled. | automated |
| R-40 | `lexiconAuthority` and `isBundledLexicon` for `app.bsky` and `town.delve`; `registerLexicon` for a bundled prefix, for an unbundled one whose authority resolves to a `did:plc` and whose schemas span two pages, for one resolving to a `did:web`, for a failing request, and for a DID document naming no PDS | The authority is the NSID's segments reversed, and only `app.bsky` is bundled. A bundled prefix fetches nothing and registers nothing. An unbundled one resolves the handle at the account's own PDS, reads the authority's DID document, follows the cursor to the end and registers every document with the record's own `$type` stripped. A `did:web` authority is read from its `.well-known/did.json`. A failing request and a PDS-less document both throw, naming which, rather than registering half a lexicon. | automated |
| R-41 | `post` on a client whose lexicon is `app.bsky` and on one whose lexicon is `town.delve`; with and without `replyTo`; with a `createRecord` that confirms a different uri and cid | The record is written into that account's own `feed.post` collection with a matching `$type`, into its own repo, carrying the text and a parseable `createdAt`, and the reply refs when replying. The uri and cid returned are the ones `createRecord` confirmed, read from `data`. | automated |
| R-42 | `createSendToLLMTask` for a notification whose thread the attenuation rule declines | One `onWaitingTaskComplete` call, with a `canceled` successor carrying the chain's `taskId`, a `doneAt`, and the reason as its last `work` line. The LLM is never asked and nothing is posted. The chain is terminal, so it leaves the WaitingSet rather than sitting there for the life of the tab. | automated |
| R-45 | Every register through `registerMenu` and `REGISTERS`; each one's `prompt` for a reply occasion and for an opening one; `isRegisterKey` for a key, for `''`, for an unknown word and for `toString` | All seven are in the menu, in order, each described by its own `criterion` — more than a few words, and never just its own name, because the menu is read by a model told nothing else about Oblique. Every postable register's prompt carries the mission, the voice, the thread, the message and `ADVERTISED_REPLY_CHARS`; each lens names its own lens and asks for 1-3 sentences; the poem asks for one stanza and the one-liner for exactly one sentence, and neither asks for a lens. `silence` is the only register with `postable` false, and its `prompt` throws rather than returning an empty one. An opening occasion replaces the thread and the message with its subject. | automated |
| R-46 | `formatThread` for a multi-post thread, a thread of one, `null` and `[]` | The last post is the message being answered and the rest is the history; a thread of one leaves the history empty; nothing to answer yields `null`, so the gate and the writer agree about what the thread is. | automated |
| R-47 | `sampleRegister` with the random pinned either side of each cumulative band; with a distribution that does not sum to 1; with an unknown label outweighing a known one; with a register at zero; with no distribution, an empty one, one naming nothing known, and one of all zeroes. Separately `randomLensRegister` walked across its range | Each draw lands in the band its weight claims, so the likeliest register is not the only one reachable; weights are normalized; unknown labels and zeroes are ignored. Every failing case falls back to a uniform lens, and `randomLensRegister` reaches all four and never `silence` — a broken Jev must not make a silent bot. `LENS_KEYS` is typed `LensKey[]`, so the compiler refuses a non-lens there and this row only confirms it. | automated |
| R-48 | `registerQuestion` and `registerState`; `chooseRegister` with a Jev that answers a distribution, one that answers without one, one that answers nothing, one that throws, one reporting itself unconfigured, and no client at all | The question is a `choice` over the whole menu; the state is context, then thread, then the post, with an empty thread said rather than left blank, and carries nothing of Oblique's voice, mission or output format. A distribution is sampled and the note names the top weights; silence is reachable. Every other case answers with a lens and a note saying which failure it was, and an unconfigured client is never called. | automated |
| R-49 | `decide` with a normal payload, checking the body and that nothing logged carries the API key; a non-OK status; a body with no `answers`; `isConfigured` with and without a key | The answers come back keyed by the names the request used. The body carries `model`, `state` and `questions` and no `messages`, with the model the client was configured with — a request cannot name its own; the key rides in the headers and is never logged. A refusal throws `Jev API error: <status> <body>` and a missing `answers` throws `Jev returned no answers`, rather than either returning nothing. | automated |
| R-50 | `createSendToLLMTask` for a thread both gates pass, with a Jev choosing a lens, one choosing `oneliner`, one choosing `silence`, one whose like is refused, and with no Jev at all | The register reaches the chain as a `Register: <key> — <note>` line appended to the work it inherited, and the prompt sent to the LLM carries that register's rules. `silence` likes the post, ends the chain `canceled` with `Silence: liked @author and left it` as its last line, and never calls the LLM or posts. A refused like changes none of that. With no Jev the chain answers in a lens and says so. | automated |

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
| R-52 | `alreadyAnsweredReason` for: our own handle among the replies; our own handle spelled with a leading `@`; a top-level post with someone else's reply; a reply with someone else's reply; a reply with none; a reply whose author cannot be read. Separately `feedRestraintReason` for a repost; our own post, spelled both ways; an author in `ignoreList`; an author in `botList`; a reply with replies; a reply with none; a top-level post with many replies; empty and whitespace text; a qualifying post; the same reason from two different authors | Our own reply is always `'we already answered this post'`, whichever way the handle is spelled. Someone else's reply declines a reply and **not** a top-level post, which stays answerable however many it carries. A reply that cannot be attributed still counts as someone having got there first. `feedRestraintReason` gives its own reason for each of the repost, the self, the ignore list, the bot list, the answered reply and the empty text, and `null` for a top-level post from a stranger — every one of them decided from the candidate alone, with no client and no request. Two different authors give the identical reason, so a look can tally them | automated |
| R-53 | `drawLabel` for: a three-label distribution probed at each band edge; weights summing to 0.2; a label `isKnown` rejects; a label at zero; no distribution, an empty one, one with nothing recognizable, and one with every weight at zero; a `random` that throws. Separately `describeWeights` for five weights, for an unoffered label, and for nothing | Each probe lands in the band its cumulative weight names, and an unnormalized distribution is divided by its own total rather than by one. An unrecognized or zero label is skipped. All four empty cases answer `null` **without consuming `random`** — the throwing generator proves it, and it is what lets R-47's fallback stay uniform. `describeWeights` keeps the heaviest `NOTED_WEIGHTS` heaviest-first, keeps a label the menu never offered, and says `'no distribution'` for nothing | automated |
| R-54 | `feedMenu` and `feedQuestion` for two candidates and for `FEED_CANDIDATES + 10`; `feedState`; `chooseFeedPost` with Jev weighted to each band edge, to `NO_PICK`, to a label never offered, and with: no candidates, no Jev, an unconfigured Jev, a throwing Jev, no distribution, an empty one, nothing recognizable, every weight at zero | The menu is one label per post plus `NO_PICK` last, and never more than `FEED_CANDIDATES` posts whatever it is given. The question is a `choice`, the state is the standing context alone, and neither carries Oblique's voice, mission, registers or output format. A draw lands in the band its weight names. **Every** other case answers no candidate with the reason in the note — an empty feed, an absent or unconfigured Jev (asked nothing at all), a throw, and any distribution with nothing drawable in it. A label the menu did not offer is never answered with | automated |
| R-55 | `nextLookAt` at the bottom, middle and top of the range; `FeedSchedule` for an unseen account, at one millisecond before and at the drawn time, twice past it, after a `reset`, across three resets with a walking generator, and for two accounts with different draws | The interval is uniform over `FEED_MIN_MIN`…`FEED_MIN_MIN + FEED_SPREAD_MIN` and never shorter than the floor. An unseen account **arms** and answers `false`, so no page load or reload opens with a post. It comes due at the drawn time and not before, stays due until reset, and draws a fresh interval on every reset. The target is the generator's **first** draw and no later one — a low draw after it cannot pull the target in, which is the whole of D-28's scheduling decision. Each account's clock is independent, and one coming due leaves the other's alone | automated |
| R-56 | `checkFeedAccount` with: one qualifying post; a batch of three where two are declined; a drawn post whose thread carries our own reply; a drawn post whose thread is `#notFoundPost`; three candidates with Jev drawing the second; no Jev; a `getTimeline` that rejects | The chosen post becomes exactly one task and the declined reasons are collected in batch order. Jev is asked only about what qualified. A post we answered, or one that cannot be read, yields **no task** with the reason in both the note and the tally. `getSinglePost` is called **once**, on the drawn post alone and never on a candidate. No Jev means no task and no fetch. A failed look reports its reason in `error` and makes no task, so one account's network costs that account alone | automated |
| R-30 | A transition from a terminal status, e.g. `succeeded → running` | Rejected rather than applied. | not yet covered |
| R-31 | A retry of a task that already posted | The idempotency fence suppresses the second post. | not yet covered |
| R-32 | Two tabs open, then the leader tab closes | Exactly one loop runs; non-leaders may submit but not process; leadership is reassigned on close. | not yet covered |
| R-33 | Terminal snapshots older than the TTL | Purged from both TaskMap and storage; non-terminal snapshots untouched. | not yet covered |
| R-51 | Something that decides Oblique should post with nothing to answer: a subject, a schedule, and a gate that can say no | A post is originated only when something chose to, in a register drawn the same way a reply's is, and the restraint that applies to replies has an equivalent here. The occasion is built (R-45); the caller is not. | not yet covered |

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
| U-10 | The Bluesky panel shows one section per configured account, headed by that account's handle, and an account that failed to check shows its reason there rather than hiding the others. | manual — check with two accounts configured and one password wrong |
| U-11 | The Bluesky panel shows a box only for a notification being answered, and beneath them one line per reason the rest were passed over, each with a count. A pass that answers nothing says so and still shows the tally. | manual — open the Bluesky panel after a pass that declined something |
| U-12 | Typing into the chat panel reports the register and how it was arrived at before the reply arrives, and a line that draws silence says so instead of being answered. | manual — type into the chat panel with a `jev` block configured, and again without one |
| U-13 | The Bluesky panel has a **Check Feed** button separate from **Check**, and clicking **Check** never posts to anyone who did not mention the bot. While polling, the status line shows when the soonest feed look falls due. | manual — click each with two accounts configured |

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

**As of 2026-10-18.** `npm test` passes and `npx tsc --noEmit` reports no errors. There is no
build step to check. Counts come from the test command and are not copied here.

### Not yet covered

R-6, R-13, R-15, R-21, and every unbuilt row R-25 … R-33.

R-15 is the one that matters most: reply threading is the remaining place where a defect
reaches Bluesky rather than the console. R-13 is cheap to close. R-21 needs the poller's
dependencies injected rather than imported.

### Partial coverage

- **R-10** — the quote and single-post branches are covered through
  `getQuotedHistory`/`getOnePostHistory`, and the threaded branch through `getThreadHistory`.
  The `getHistory` dispatcher that chooses between them is exercised only indirectly, and the
  `THREAD_MAX_DEPTH` cap itself is not asserted.
- **R-12** — the list, the `rotate` pin and the empty-list error are covered; the day-to-day
  advance is covered only through `dailyCircularKey` with a pinned clock, not through
  `getDailyModel` itself. The claim that the rotation is *perceptible* is X-5 and is unmeasured.
- **R-14** — `truncateAtLastPunctuation` is covered in detail, through the exported function
  itself, and the gate is covered at both edges: a response of exactly
  `MAX_BLUESKY_REPLY_CHARS` is accepted without a second call, one character over is asked
  again and the short second response is the one posted. Not covered: that truncation happens
  only on the final attempt.
- **R-17** — v1's own fields are covered directly, but the integration test follows the chain
  to v3 and stops there; it does not process the post task, so the `waiting` v4 and the
  terminal v5 are covered only by R-16, and v2 inheriting v1's `conversation` is covered only
  by R-1.
- **R-18** — construction and the resolve path are covered; the reject path is not.
- **R-43** — the split and the tally are covered, and that a mention and a like are both
  judged without a fetch. The rendering is not: `renderAccountCheck` is private and no test
  drives the DOM, so "a declined notification gets no box" is U-11 and manual.
- **R-42** — the attenuation route into `canceled` is covered end to end through
  `createSendToLLMTask`. The empty-thread and over-length routes reach the same successor by
  the same line of code and are covered only at `threadRestraintReason` (R-9). That the
  orchestrator then clears the WaitingSet entry is R-7's, asserted there against a terminal
  successor rather than against this one.
- **R-37** — the order of the sections, the shared prefix above the voice, the single home of
  the output format and the position of the restatement are all asserted. That the ordering
  actually earns a cache hit is a property of the provider, not of this code, and nothing here
  measures it.
- **R-21** — the polling *toggle* handler, the interval clamp (U-7), `fetchPostData` and
  `checkAccount` are covered; `checkNotifications` itself is not, so that one notification's
  `null` post data leaves the rest of the batch to be considered, and that every account's
  tasks reach the one queue, are asserted only at the helpers, not through the loop.
- **R-38** — the sections that become accounts, their order, the handle normalization, the
  `atproto-proxy` header and both the blank and the half filled in section are all asserted.
  The `service` is checked through `BlueskyClient.serviceUrl()`, which echoes the config the
  client was handed; that the agent then signs in *there* is a property of `@atproto/api`,
  and no unit test drives a real login. `just cc-smoke` does, against the live accounts, and
  is the only thing that can answer "do both networks actually answer".
- **R-41** — the collection, the `$type`, the repo, the text, the `createdAt`, the reply refs
  and the confirmed uri and cid are all asserted, against a mocked `createRecord`. No test
  writes a post to a real server, and `just cc-smoke` is read-only by design, so neither can
  answer whether a server accepts the record. That was settled by hand instead: see the
  2026-10-18 history entry for the reply that landed. Re-check it by hand after any change
  to how the record is written, because delve.town stores a wrongly-namespaced post and never
  shows it — a wrong collection fails silently, not loudly. The three sibling calls build
  their NSID the same way and no test pins any of them: the thread suites route
  `api.xrpc.call` to a spy that discards the NSID, and nothing exercises
  `notification.listNotifications` or `notification.updateSeen` at all. A wrong prefix there
  is a 501 rather than a silent loss, and `just cc-smoke` is what catches it.
- **R-20**, **R-44** — the decisions are covered: when to sign in, what expiry to believe, and
  what a refused call does next, all against a mocked `agent.login` and a mocked request. What
  no unit test can answer is whether a login at either PDS succeeds, or what status a real PDS
  answers with for a token it has forgotten — the retry is written for a 401 and for a 400
  carrying `ExpiredToken`, and a PDS answering anything else would fall through to the caller.
  `just cc-smoke` signs in to both networks for real and is what catches the first; the second
  has not been observed, because the JWT has always parsed and the fallback has never run.
- **R-40** — the resolution chain, the paging, the `$type` strip and both failure paths are
  asserted against a mocked `fetch`. That the 169 documents delve.town publishes are
  *accepted* by the SDK's registry is not asserted here; `just cc-smoke` registers them for
  real and fails if any is rejected.
- **R-39** — the rejecting account and the empty batch are covered directly. That a later
  account is still checked after an earlier one fails follows from `checkAccount` returning
  rather than throwing, but the loop in `checkNotifications` that relies on it is not driven
  (the same gap as R-21). The task-creating path through `judgeNotifications` is covered by
  R-43.

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
