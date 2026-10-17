# Oblique — Architecture Log

The only document in this set that carries *why* and *when*. `ONTOLOGY.md` and
`CRITERIA.md` describe the current state and nothing else; everything historical — what a
thing replaced, what else was considered, what was measured, what is still unsettled — lives
here.

Three sections: **Decisions** (the why of what is true now), **Open questions** (what is not
settled), **History** (dated entries, newest first).

---

## Decisions

### D-1 Replies are oblique by construction, not by instruction alone — *Decided*

- **Alternatives:** a single "be indirect" line in the system prompt; a post-hoc filter that
  rejects direct answers; a fine-tuned model.
- **Why:** the four lenses (supertext, subtext, architext, psychotext) give the model a
  *procedure* rather than a prohibition. "Don't answer directly" produces evasion; "read this
  through its archetypal structure" produces a different kind of sentence. The lens is picked
  per reply so a thread does not settle into one register. Serves G-1.
- **Evidence:** none. X-1 is unmeasured.

### D-2 Immutable snapshots with closure-carried behavior — *Decided*

- **Alternatives:** mutable task objects with a status field; a class hierarchy per task type;
  a reducer over a discriminated union of task types.
- **Why:** a chain's history is a sequence of values, so a bug can be reconstructed by reading
  versions in order rather than by replaying mutations. Closures let a task type carry its own
  dependencies (an LLM client, a Bluesky client, a notification) without the orchestrator
  knowing any of them — the core stays free of both the DOM and the network. The cost is that
  a snapshot cannot be serialized, which is what makes persistence (R-25) a redesign rather
  than an addition. Serves G-3, G-5.
- **Evidence:** none.

### D-3 24-character safe-base32 identifiers — *Decided*

- **Alternatives:** UUID v4; an incrementing counter; a timestamp plus a random suffix.
- **Why:** `l`, `1`, `o` and `0` are excluded so an id can be read off a screen, said aloud and
  retyped without ambiguity — which is what a human debugging a chain actually does. 24
  characters over a 32-symbol alphabet is 120 bits, far more than a single tab's lifetime
  needs; the length is for legibility, not collision resistance. Serves G-3.
- **Evidence:** `npm test` — R-22 asserts the alphabet and the exclusions.

### D-4 One `config.json`, complete, with no defaults in code — *Decided*

- **Alternatives:** environment variables through Vite's `import.meta.env`; `localStorage`
  written by a settings UI; a settings UI as the source of truth; a `DEFAULT_CONFIG` in code
  that `config.json` is deep-merged over (what it was until 2026-10-17).
- **Why:** the page is served statically and has no build step per deployment, so a file
  fetched at startup is the only thing that can be changed without rebuilding. A second
  writable source was tried and rejected: two places holding the same API key means a
  precedence rule to remember, a stale copy in a browser that outlives the file, and a secret
  where any script on the origin can read it. Defaults in code are the same problem in
  quieter form — answering "what model is it using" meant reading a file and a constant and
  working out the merge, and the merge had its own rules to remember (objects merge, arrays
  replace). One complete file costs a longer template and loses the partial-config
  convenience; it buys a configuration you can read in one place. The Configure panel is a
  note pointing at the file. Serves G-2, G-4.
- **Evidence:** `npm test` — R-19 covers a complete file, a partial one, and the three
  failure modes of the fetch.

### D-5 Model and voice rotate daily; the lens rotates per reply — *Decided*

- **Alternatives:** a fixed model; a random model per reply; a model chosen by thread length
  or cost. For where the list lives: a hardcoded map in `prompts/oblique.ts` (what it was),
  one model name in `config.json` beside a separate rotation list, a remote list.
  For switching rotation off: a `model` field that wins when set, versus a `rotate` flag.
- **Why:** a per-reply model makes the bot incoherent within a conversation. A fixed model
  makes it monotonous across weeks. Day-granularity gives it a consistent character for a day
  and a different one tomorrow, which also turns the rotation into a cheap comparison across
  15 models on identical traffic. The `genders` array is weighted by repetition rather than by
  probability — male and female recur through it so the daily cycle lands on them more often
  while still reaching every entry — because an array index is the whole mechanism and a
  weights table would be more machinery than the effect is worth. Serves G-1.

  The list is `config.openrouter.models`, not code: which models the bot speaks through is a
  deployment choice, and changing it should not be a rebuild. Where OpenRouter publishes a
  floating `~vendor/model-latest` alias, the list uses it rather than a dated slug, so a
  vendor's own releases reach the rotation without an edit; the bot drifting under us is the
  point, since D-5 wants variety rather than a fixed set. Vendors with no alias stay pinned
  and go stale. `rotate` ships **false**, so a fresh install speaks with one voice until
  someone turns the walk on — the rotation is worth opting into, not worth inflicting on
  someone who has not read this far. `rotate: false` pins the bot to
  the first entry, so pinning is a reordering rather than a second field that can disagree
  with the list. There is no config-level `model`, so both LLM paths must name one on the
  request and no call can go out unnamed — which is what let the reply path silently diverge
  from the rotation.
- **Evidence:** `npm test` — R-12 covers the rotation, the `rotate: false` pin and the empty
  list. X-5 is unmeasured.

### D-6 Restraint is two gates, cheap then expensive — *Decided*

- **Alternatives:** one gate after fetching the thread; one gate before; an LLM call that
  decides whether to reply.
- **Why:** the notification gate runs on data already in hand and rejects the common cases —
  ignored authors, bare quotes, posts someone else already answered — before any thread fetch.
  The thread gate needs the full history and so cannot run first. Splitting them keeps the
  expensive fetch off the rejected majority. A direct mention bypasses the "someone already
  replied" check entirely: it was addressed to the bot, so another reply existing is
  irrelevant. Serves G-2.
- **Evidence:** `npm test` — R-8 and R-9 cover both gates.

### D-7 Bot attenuation by window, not by blocklist — *Decided*

- **Alternatives:** never reply to any handle in `botList`; a hard cap on replies per thread;
  a random drop rate.
- **Why:** two Oblique-class bots will otherwise answer each other until an API quota stops
  them. Refusing all bots forecloses the interesting case — bots talking to each other is
  worth some of it, just not unboundedly. The window engages only when a *bot* spoke last, so
  a human carrying a long exchange is never throttled by it. `BOT_ATTENUATION_LIMIT` of 4 in a
  `BOT_WINDOW` of 8 means a bot may hold half the recent turns before the bot stops
  answering. `THREAD_MAX_POSTS` of 60 is the backstop for everything the window misses.
- **Evidence:** none for the specific numbers. X-4 is unmeasured; 4-of-8 and 60 were chosen by
  judgment, not measurement, and should be treated as untested.

### D-8 History assembly degrades rather than fails — *Decided*

- **Alternatives:** abort the reply when any ancestor cannot be fetched; retry the fetch;
  treat a missing post as an error surfaced to the UI.
- **Why:** deleted posts are the normal case on a social network, not an exception. A missing
  ancestor costs context; aborting costs the reply. Every failure path therefore falls back to
  `[{ author, text }]` and a NotFound is logged at `debug` rather than `warn`, so the console
  stays readable. `THREAD_MAX_DEPTH` of 25 bounds the fetch; alt text is included because an
  image's description is part of what was said. Serves G-1, G-2.
- **Evidence:** `npm test` — R-10 covers the fallbacks on each branch.

### D-9 Ask again before cutting — *Decided*

- **Alternatives:** truncate on the first over-long response; lower `max_tokens` so the model
  cannot overrun; a second LLM call that shortens the first.
- **Why:** a model that overran once usually complies when asked again, and a cut sentence
  reads as a failure in a way a slightly different sentence does not. `LLM_MAX_ATTEMPTS` of 5
  is the budget; truncation is the floor, not the plan, and cuts at a punctuation boundary
  with the mark dropped so the result ends like a sentence rather than a fragment. Lowering
  `max_tokens` was rejected because the prompt asks for a long reasoning document of which
  only the `# Response` section is posted. Serves G-1.
- **Evidence:** `npm test` — R-14 covers truncation in detail and the gate at both edges;
  that truncation happens only on the final attempt is not covered.

### D-10 LLM parameters are set per call site, not per client — *Decided*

- **Alternatives:** one set of parameters in `LLMConfig`; parameters in `config.json`.
- **Why:** the OpenRouter client carries conservative fallbacks
  (`OPENROUTER_FALLBACK_TEMPERATURE`, `OPENROUTER_FALLBACK_MAX_TOKENS`) so a bare call is safe,
  and each call site overrides them for what it needs — both Oblique paths ask for
  `LLM_TEMPERATURE` and `LLM_MAX_TOKENS` because the prompt demands a long document at some
  creative temperature. The fallbacks exist for a future call site that has not been written.
- **Evidence:** none.

### D-11 Poll a small batch frequently — *Decided*

- **Alternatives:** a large batch polled rarely; a firehose subscription; webhooks.
- **Why:** `NOTIFICATION_BATCH` of 3 at `POLL_DEFAULT_S` of 60 keeps each pass short enough
  that a failure costs one minute, and keeps the per-pass API cost bounded — each notification
  costs a `getSinglePost` before the gate even runs. The page has no server, so a subscription
  or a webhook is not available. The interval is clamped to `POLL_MIN_S`…`POLL_MAX_S` because
  the input is a text field a human types into.
- **Evidence:** none.

### D-12 Refresh the token early, on a buffer — *Decided*

- **Alternatives:** re-authenticate on a 401; re-authenticate before every call;
  re-authenticate on a fixed schedule.
- **Why:** a token that expires mid-call loses the reply, and the reply is the whole point.
  `TOKEN_REFRESH_BUFFER_MS` of 5 minutes is ample for any single AT Protocol call.
  `TOKEN_DEFAULT_TTL` of 1 day applies when the JWT cannot be parsed — short enough to
  self-correct, long enough not to hammer the login endpoint. Authentication state is cleared
  *before* the login attempt so a failure cannot leave the client believing it is
  authenticated.
- **Evidence:** none. R-20 is not yet covered.

### D-13 Like before replying — *Decided*

- **Alternatives:** like after a confirmed post; do not like at all; like only on mentions.
- **Why:** the like is the acknowledgement and should land even if the reply does not. It is
  dispatched first and never awaited, so a slow like cannot delay the reply and a rejected one
  is logged rather than carried into the chain. Serves G-1.
- **Evidence:** R-16 asserts that the like is dispatched before the post and that a rejected
  like still leaves a succeeded reply.

### D-14 No persistence, deliberately — *Decided*

- **Alternatives:** IndexedDB from the start; `localStorage`; a server.
- **Why:** persistence is the feature that drags in every other one — serialization (which
  closures block, see D-2), restore semantics, idempotency so a restored task cannot
  double-post, pruning so storage does not grow without bound. A tab's memory has none of
  those problems, and losing in-flight work when the tab closes costs at most one unposted
  reply. Serves G-4; the whole of R-25 … R-33 is the deferred bill.
- **Evidence:** none.

### D-15 Reasoning is off for every model — *Decided*

- **Alternatives:** leave it on and raise `LLM_MAX_TOKENS` until the budget covers reasoning
  as well as the answer; leave it on only for the models known not to reason; pick a reasoning
  effort per model.
- **Why:** the prompt already asks the model to think on the page — `# Thinking`,
  `# Related Western`, `# Related Eastern`, three `# Insight` sections — and only `# Response`
  is ever posted. Private reasoning is therefore a second, invisible draft of work the prompt
  has already commissioned, and it is emitted *before* any content, so on a reasoning model it
  can consume the whole allowance and leave nothing to post. Raising the budget works but pays
  for the invisible draft; a per-model list is the kind of table that rots as the floating
  `~*-latest` aliases move under it. One flag for every model is the smaller thing, and a model
  that rejects it is a problem to meet when one appears.
- **Evidence:** `Measured by: the Oblique system prompt and a one-post thread against
  ~deepseek/deepseek-flash-latest` → with reasoning on and `max_tokens` 2000, all 2000
  completion tokens were reasoning, `content` was null and `finish_reason` was `length`; the
  same call at 8000 finished, spending 5053 of 5118 tokens on reasoning for a 228-character
  answer at $0.0040. With reasoning off at 2000, the same call finished in 276 tokens at
  $0.00035 — a tenth of the cost, with a longer document to extract from.

### D-16 A reply succeeds only when Bluesky confirms it — *Decided*

- **Alternatives:** keep succeeding on dispatch and read failures out of the console; await the
  post inside `process()` and block the orchestrator until Bluesky answers; fire and forget,
  but mark the snapshot `succeeded (unconfirmed)`.
- **Why:** a `succeeded` snapshot carrying the placeholder URI `reply-posted` for a reply that
  never landed is the task graph lying about the one thing it exists to record, and the
  rejection surfaced only as an unhandled promise in the console. The post now drives a waiting
  snapshot the same way the LLM call does, so the chain reports what happened and carries the
  URI Bluesky returned. Awaiting inside `process()` was rejected for the reason D-2 gives: the
  worker loop is single-threaded and must not block. Serves G-3, and G-1 through not claiming a
  reply that is not there. Settles Q-8.
- **Evidence:** R-16 covers both the resolve and the reject path; the resolve path asserts the
  returned URI rather than a placeholder.

### D-17 Only a waiting chain can be resumed — *Decided*

- **Alternatives:** leave the WaitingSet unchecked and rely on each chain having exactly one
  promise in flight; track a callback token per chain and compare it; make the successor's
  version the guard, refusing anything that is not `predecessor.version + 1`.
- **Why:** `resumeWaitingTask` checked TaskMap and nothing else, so a repeated or late callback
  transitioned a chain that had already settled — overwriting a terminal snapshot or
  re-queueing finished work. The WaitingSet already records exactly which chains have a promise
  outstanding, so it is the guard; a token or a version check would add state to say what the
  set already says. The one-promise-per-chain invariant that made this harmless is an accident
  of the current factories, not a rule, and D-16 made the posting path a second in-flight
  promise in the same chain. Serves G-3, and G-1 through never posting twice.
- **Evidence:** R-7 covers the repeated callback, the late failure after success, and the stale
  callback against a chain that has resumed into `ready` work; with the guard removed, all
  three fail.

### D-18 A task's work product is a list of lines, appended to by every step — *Decided*

- **Alternatives:** keep `work` a single string that each step concatenates onto; make it a
  list but let each step write its own result over the previous one; give each line a record
  of its own (`{ at, text }`).
- **Why:** `work` was a string, and most steps replaced it outright — the snapshot that
  recorded a posted URI threw away the draft it had posted, and the only reason a chain's
  earlier output survived anywhere was that one or two steps happened to concatenate. A list
  that every step appends to makes the latest snapshot carry the whole trace, which is what
  the observer, queue and waiting panels already serialize, and what a retry or a longer chain
  will keep adding to. A record per line carries metadata nothing reads today. Serves G-3, G-4.
- **Evidence:** R-36 covers the append rule and `latestWork`; R-17 checks the trace end to end.

### D-19 One enforced limit, a smaller one advertised to the model — *Decided*

- **Alternatives:** one number everywhere, enforced and advertised; enforce the 300-grapheme
  Bluesky limit and say nothing to the model; ask the model to count and refuse its own
  over-long reply.
- **Why:** models count characters badly, so a prompt that names the hard ceiling produces
  replies a few characters over it and burns a retry. `MAX_BLUESKY_REPLY_CHARS` is 300 —
  Bluesky's own post limit, the gate in `generateLLMResponseWithRetry` and the truncation
  point, all the same number — and the prompt asks for `ADVERTISED_REPLY_CHARS`, 300 less a
  10-character margin for the overshoot. Both live in `src/reply-length.ts` because neither
  makes sense without the other, and the prompt interpolates its number rather than restating
  it in prose. Serves G-1 and the *terse* quality.
- **Evidence:** `npm test` — R-14 asserts the gate at both edges.

### D-20 The prompt is ordered by how often each part changes — *Decided*

- **Alternatives:** write the prompt in the order it reads best and accept the cache misses;
  put the thread history above the lens, so a second reply in the same thread shares more;
  move the output-format instruction into the system prompt, where it would never be re-read.
- **Why:** a prefix cache keeps a request's prompt only up to the first byte that differs from
  the last one, so a fixed block written below a variable is paid for on every request. The
  fixed mission and output format go first, then the voice (one value per UTC day), then the
  lens (one of four, per reply), then the thread history, then the message. The lens is above
  the thread because consecutive replies usually belong to different threads, so four lens
  blocks are reused far more often than one thread's history. The format instruction stays in
  the user message rather than moving into the system prompt: it already sits inside the
  fixed prefix, so moving it would change what the model is told for no further caching, and
  the system prompt's own section list already disagrees with it (Q-14). This serves no §0
  goal: cost is not among them. It is free — only the order changed, not a word of what the
  model is told — and that is the whole case for it, not a reason to reshape the prompt
  further.
- **Evidence:** `npm test` — R-37 asserts the order and the shared prefix. Whether a given
  provider turns that order into a hit is not measured here.

### D-21 The output format is stated once, in the system prompt, and restated in one line at the end — *Decided*

- **Alternatives:** leave the two statements as they were; keep both but make them agree; put
  the single statement in the user message's fixed prefix instead.
- **Why:** the system prompt asked for "3 sections, Thinking, Related Western, Related
  Eastern, and Response" while the user message asked for "6 sections" and named seven,
  Insight 1 … 3 among them. The lists disagreed and neither count matched its own list, so the
  model was given two answers to one question. The format now appears once, as a fenced
  skeleton under `# Output format` in `systemPrompt` — no count, the headings themselves are
  the list. The system prompt is the right home because both call sites send it and it carries
  no interpolation at all, so the format sits in the longest fixed prefix there is.
  `obliquePrompt` then closes, after the message being answered, with three lines naming the
  task again and the one constraint that matters: `# Response` is what gets posted and must be
  `ADVERTISED_REPLY_CHARS` or less. That tail is fixed text in the least cacheable position in
  the prompt, which is the point — it is there for recency, and it is short because it is paid
  for on every request. Serves G-1 and the *terse* quality.
- **Evidence:** `npm test` — R-37 asserts that the format appears only in the system prompt
  and that the restatement is last.

### Deliberately left out

- **Multi-turn memory of its own.** Context is re-read from the Bluesky thread on every pass.
  A thread is already the conversation log; keeping a second copy would make the two disagree.
- **Agents.** The 2025-10-11 rewrite removed the concept; tasks and chains cover it. Do not
  reintroduce an entity that owns a queue.
- **A storage interface.** Removed 2025-10-11 and not missed. Its presence implied a
  persistence story that did not exist (D-14).
- **Credentials in `localStorage`.** Built on 2026-10-17 and removed the same day. See D-4:
  one API key in two places is worse than retyping it into a file.
- **Concurrency.** One task at a time is a design property, not a performance ceiling to be
  lifted. R-32 would change this and has not been accepted.

### How it is abused

Normal use is a human mentioning the bot, or replying to it, and getting one reply. The
exposure is that the bot posts under a real account with a real app password, on input anyone
can write.

| Abuse | Prevention | Criteria |
|---|---|---|
| Bot-to-bot loop burning quota | `skipForBotAttenuation`: stop when a `botList` handle holds `BOT_ATTENUATION_LIMIT` of the last `BOT_WINDOW` posts | R-9, X-4 |
| Unbounded thread growth | `THREAD_MAX_POSTS` cap in `shouldRespondToThread` | R-9 |
| A persistent harasser | `config.ignoreList`, checked first | R-8 |
| Quote-post farming — quoting the bot to force a reply | Quotes are answered only when the text contains the bot's handle | R-8 |
| Dogpiling an already-answered post | Non-mentions are skipped when the post has replies | R-8 |
| Prompt injection in a post or alt text | System-prompt instructions against persona changes and implementation disclosure. **Weak** — this is instruction, not mechanism, and a post is interpolated into the user message unescaped | none. Q-6 |
| An over-long or unsafe reply | Length retry then truncation; PG-rated and no-self-harm clauses in the system prompt | R-14, X-2 |
| XSS through notification text rendered into the panel | `escapeHtml` before interpolation in `renderNotificationAsHtml` | U-5 |
| Duplicate posting after a retry | **None.** There are no retries today, so the exposure is latent; it becomes real with R-26 and is what R-31 would fence | R-31 |

---

## Open questions

Each is a real decision for the designer, not a task.

### Q-1 The dead vocabulary in `src/types/index.ts` — *tracked as `deadtypes-mrsf`*

`Task`, `PendingTask`, `Conversation`, `StorageData`, `TaskId`, `UserId` and `ConversationId`
are imported by nothing. They are the vocabulary of the pre-2025-10-11 design. The same is
true of `generateConversationId`, `generateId` and `wait` in `src/utils/index.ts`, of
`generateCorrelationId`, which the barrel exports and the tests exercise but no application
code calls, and of `BlueskyClient.hasRepliesToPost`, whose job the notification gate does for
itself. **Recommendation:** delete them, keeping `BlueskyMessage`, `BlueskyPost`,
`LLMRequest` and `LLMResponse`. Risk is zero — the TypeScript build proves nothing imports
them — but `hasRepliesToPost` and `generateCorrelationId` take their tests with them.

### Q-3 `errorWaitingTask` is identical to `resumeWaitingTask` — *tracked as `errwait-rwzm`*

Both do exactly the same thing — the bodies differ only in their comments — and the
difference is only in the successor the caller passes.
**Recommendation:** keep both names — the call sites read better — but make
`errorWaitingTask` delegate, so the duplication cannot drift. Alternatively give it a real
difference: assert the successor is terminal.

### Q-5 Refused chains leak a WaitingSet entry — *tracked as `waitleak-duk4`*

When either restraint gate returns `null`, `sendReply` logs and returns without calling
`onWaitingTaskComplete`. The chain stays `waiting` forever — harmless today because nothing
scans the set and the tab clears it, but it means `waitingSize` overstates real work.
**Recommendation:** add a `canceled` successor on the refusal path, which is what the status
exists for. R-27's timeout would also catch it, less precisely.

### Q-13 The orchestrator's commands are async but never await — *tracked as `asyncorch-fenk`*

`processNextTask` and `processAllTasks` are declared `async`, and `startLoop`'s frame body
awaits the first of them, yet nothing inside any of them awaits: `process` is synchronous by
invariant, so the promise always resolves in the same turn. The shape costs a microtask per
frame and tells a reader the core is asynchronous when the whole design says it is not.
**Recommendation:** drop `async` from all three and let the commands return the state
directly; `await` at the call sites keeps working either way. Against: if a future step ever
needs to await, the signature is already there — but the invariant says that step belongs in
a factory closure, not in the orchestrator.

### Q-6 Prompt injection has no mechanical prevention

Post text and image alt text are interpolated into the user message without escaping or
delimiting, and the only defense is prose in the system prompt. **Recommendation:** decide
whether this is an accepted risk for a bot whose output is one short public post, or whether
it warrants fencing untrusted text in explicit delimiters and restating the constraint after
it. Either answer should be recorded as a decision; the current state is neither.

### Q-7 Numbers are literals, not named constants — *tracked as `namenums-vnzy`*

`ONTOLOGY.md` names 23 tunables; only four exist as named constants in the code. The rest are
literals at their use site, so tuning means finding them. **Recommendation:** extract them to
one module per area and have the ontology's table quote the names. Until then the table and
the code can drift silently.

### Q-10 `window.oblique.getState` calls `require()` — *tracked as `getstate-viig`*

`index.ts`'s `window.oblique.getState` calls `require()` inside an ES module bundle and will
throw in the browser. A bug, not a design question; it is here because the conversion found
it. **Recommendation:** fix it as a separate change. The configure-panel save defect this
question also carried is gone with the panel's fields; see the History entry.

### Q-12 Is DadaBot a planned second persona, or dead material? — *tracked as `buildbreak-4s8x`*

`src/prompts/dadabot.md` holds a complete second-persona prompt — "the ghost of Tristan Tzara
reborn in a machine", with its own principles, form, tone and six generative operations. No
code references it, and nothing in the ontology describes a bot with more than one voice. Its
`${threadHistory}` and `${userMessage}` placeholders mirror `obliquePrompt`, so it was written
to be wired in. **Options:** build it as a second persona, which needs an entity and a
selection rule in `ONTOLOGY.md`; keep it as unwired material in `src/prompts/`, beside
`system.20251016.1012.txt`; or delete it. **Recommendation:** keep it as material until there
is a reason to choose a voice at runtime. A second persona is a product decision, not a
cleanup, and the file costs nothing where it sits.

Separately, `createTaskFromFunction` is exported from `drakidion.ts` and tested but used by no
application code. **Recommendation:** keep it as public API of the orchestration layer and say
so, as `ONTOLOGY.md` now does.

---

## History

### 2026-10-17 — The oblique prompt is ordered least volatile first
`obliquePrompt` interleaved its variables with its fixed text: the lens and the voice were
written in the middle, with the output-format instruction below them, so a block of text that
never changes sat behind two values that change every reply and every day. A provider's prefix
cache stops at the first difference, so that block was re-read on every request. The prompt now
runs fixed text, then the daily voice, then the lens, then the thread history, then the message
being answered. The lens is deliberately above the thread: consecutive replies usually belong to
different threads, so four possible lens blocks are reused more often than one thread's history.
Nothing the model is told has changed, only the order it is told in. ONTOLOGY's conversation
construction rule now states the ordering and why; D-20 records the choice and R-37 asserts
it. Reading the two prompts side by side also showed them asking for different sections, with
neither count matching its own list; D-21 collapses that to one statement in the system prompt
and closes the user message with a three-line restatement of the task, placed last for recency
rather than for caching. Oblique answers one
notification at a time rather than carrying a conversation, so most of the prompt below the
fixed text still misses — this is the best the shape of the work allows.

### 2026-10-17 — The notification text survives into the first snapshot of a reply chain

`createReplyTask` built v1 with `conversation` stated *before* `...newReadyTask(description)`,
and the factory base states `conversation: undefined`, so the spread overwrote the field and
every chain's first snapshot carried no conversation at all. Nothing broke — the conversation
sent to the model is rebuilt from the fetched thread before the LLM call — but the Waiting and
Observer panels showed an empty conversation for a task whose whole subject is that message.
The spread now comes first and the explicit fields follow it, which is how the other factory
site (`createObliqueMessageTask`) was already written. ONTOLOGY's succession rule now says the
base is spread first and why; R-17 covers v1's own fields, with and without notification text.
Closes `convoclob-bynk`.

### 2026-10-17 — One reply-length limit, enforced at 300 and advertised as 290

Four numbers were in play and they disagreed: `MAX_BLUESKY_REPLY_CHARS` was 299, the retry
gate accepted anything under 300, and the system prompt said "less than 279 characters" in
one line and "299 characters or less" in another, with a third line capping the `# Response`
section at 300. `src/reply-length.ts` now holds both numbers the system uses:
`MAX_BLUESKY_REPLY_CHARS` 300, enforced by the gate and the truncation point alike, and
`ADVERTISED_REPLY_CHARS` 290, interpolated into the three places the prompt states a limit. The
redundant "Be terse, limit all responses to 299 characters or less" bullet lost its number
and kept "Be terse". Settles Q-11 as D-19; `REPLY_LENGTH_GATE` leaves the numbers table,
since the gate no longer has a number of its own. `truncateAtLastPunctuation` is exported and
the tests now call it — they had been asserting against a copy of the function pasted into
the test file, with a different punctuation set and a 279 default, so the suite agreed with
itself and not with the code. Closes `replylen-6a9i`.

### 2026-10-17 — Ontology review: the docs are reconciled with the code

A pass over `ONTOLOGY.md` against `src/`. Seven places where the reference no longer matched:
the `createTaskFromFunction` builder was described as public API of the orchestration layer
but was missing from the `drakidion.ts` barrel (now exported, which is what the description
assumed); `errorWaitingTask` was called byte-identical to `resumeWaitingTask`, true until
D-17 gave each its own comment; the `doneAt` gap in `processNextTask`'s catch path pointed at
an open question that does not exist and now cites `doneat-76kf`; the function builder's
pseudocode used `??` where the code uses `||`; the poller was documented as clamping the poll
interval when it falls back to `POLL_DEFAULT_S` and only the input is clamped; the chat
chain's `error extracting response content` fallback and its caller-settable temperature were
undocumented; and the orchestrator's async command shape was documented nowhere, which is now
Q-13 (`asyncorch-fenk`). `src/panels.ts` also exported a `Config` interface describing a
configuration shape that has not existed since D-4 — unused, and deleted. The unreferenced
generators in `src/utils/index.ts` and `BlueskyClient.hasRepliesToPost` join the dead
vocabulary and Q-1. In `CRITERIA.md` a stray blank line had split the R table in two.

No rule changed and no behavior changed; `just check` stays at 18 suites, 167 tests.

### 2026-10-17 — The duplicate `waiting-map.ts` is gone and its tests point at the module in use

`src/drakidion/waiting-map.ts` was a byte-identical copy of `waiting-set.ts` that nothing
imported, and `test/drakidion/waiting-map.test.ts` was the only file reading it, so R-23's
twelve WaitingSet assertions landed on a dead module and an edit to the module the
orchestrator runs could not break them. The copy is deleted, the test is renamed
`test/drakidion/waiting-set.test.ts` and imports `waiting-set.js`, and R-23 loses its partial
coverage note. Settles Q-2 (`dupwaitset-tu5f`); no behavior changes.

### 2026-10-17 — A task's `work` becomes a list of lines that every step appends to

`work` was a single string. Most steps replaced it with their own result, so the posted URI
snapshot dropped the reply text it had just posted, and the two steps that did keep history
did it by concatenating with `'\n'` — a formatting convention rather than a value. The
observer, queue and waiting panels serialize the task record as JSON, where all of that showed
as one opaque blob.

`work` is now `string[]`, one line per step, and every step appends: the base's lines, then
its own. `newWaitingTask` no longer seeds `'Waiting...'`, so both factories start a chain with
no lines and the first line is written by whichever factory starts it. The succeeded post line
is now just `Posted: <uri>`, because the reply text is already the line before it.
`latestWork`, in the new `task-work.ts`, returns the last line and `''` for none, which is what
the chat panel shows and what keeps its `[No response received]` fallback working.
`createSendToLLMTask` and `createPostReplyTask` now take a full snapshot rather than a
`Partial<DrakidionTask>`, since they read the base's lines; the two `as DrakidionTask` casts
went with it. This is D-18.

R-36 is new, covering the append rule and `latestWork`, and R-17 now asserts the accumulated
trace. Nothing is stored between sessions, so the change lands on a page refresh with nothing
to migrate. `just check` passes: 18 suites, 167 tests.

### 2026-10-17 — A callback is accepted only while the chain is still waiting

`resumeWaitingTask` and `errorWaitingTask` checked only that the `taskId` was in TaskMap.
A callback that arrived twice, or after the chain had already settled, therefore transitioned
it again: a terminal snapshot was overwritten by a later one, and a chain that had resumed
into `ready` work had that work replaced. Nothing triggered it today because each chain held
one promise at a time, but that is a property of the current factories rather than a rule, and
D-16 had just given the reply chain a second awaited call.

Both functions now return the state unchanged, with a warning, when the `taskId` is not in the
WaitingSet. The TaskMap guard stays ahead of it, so a `taskId` that is waiting but unmapped is
still cleaned out of the set. Q-4 is settled as D-17.

R-7 grows from two cases to six: the two original paths plus a repeated callback, a late
failure for a chain that already succeeded, and a stale callback against a chain that has
resumed into queued work. The orchestrator suite's console suppression moved from hand-rolled
save/restore to `jest.spyOn`, so the warnings can be asserted. `just check` passes: 17 suites,
165 tests.

### 2026-10-17 — A reply is reported when Bluesky confirms it, not when it is dispatched

`createPostReplyTask.process()` was synchronous and awaited neither `like` nor `post`. It
returned a `succeeded` snapshot carrying the string `reply-posted` as the URI, so a rejected
post left a chain claiming a reply that did not exist, no dead snapshot, and an unhandled
rejection in the console — the largest gap between what the orchestrator reported and what
actually happened.

`process()` now returns a `waiting` snapshot and resumes from the post promise through
`onWaitingTaskComplete`, exactly as the LLM step does, so the reply chain is five snapshots
rather than three: v4 is the post in flight and v5 is `succeeded` with the URI Bluesky
returned, or `dead` with the rejection's message. The like keeps its dispatch-and-forget
shape — it is an acknowledgement, not the reply — but now has a `catch` that logs, which is
the other unhandled rejection gone.

The three synchronous failures before dispatch (blank text, a thrown `notificationReplyTo`, a
client that throws rather than rejecting) still yield `dead` straight from `process()` with no
waiting snapshot, so the orchestrator never sees a chain waiting on a promise that was never
made.

Q-8 is settled as D-16. `createPostReplyTask` takes `onWaitingTaskComplete` ahead of its base
task; `sendReply` is its only caller. R-16 gains the resolve and reject paths and the rejected
like; R-17's chain description grows to v5, with the integration test's stopping at v3 named
under partial coverage. `just check` passes: 17 suites, 161 tests.

### 2026-10-17 — The OpenRouter client stops logging its own API key

`console.log(fetchOptions)` printed the whole request to the browser console, headers
included, so every call wrote `Authorization: Bearer sk-or-v1-...` where anyone looking at the
console — or at a screen recording, or a pasted stack trace — could read it. The log now takes
the request body alone, which is the part worth seeing anyway. R-35 gains an assertion that
nothing logged contains the key, and it was confirmed to fail against the old line before the
fix went in.

The key was never at risk off the machine: Oblique runs as one page, the console is local, and
the only operator is the repository's owner. This is hygiene against the day either of those
stops being true.

### 2026-10-17 — `LLM_MAX_TOKENS` raised from 2000 to 8000

Turning reasoning off earlier today did not end the no-content failures, so the budget was
the remaining suspect. `LLM_MAX_TOKENS` goes to 8000 at both Oblique call sites.

The entry below claimed 2000 was ample with reasoning off. It was ample in the one measured
call, which is not the same thing: the prompt asks for a seven-section document — three
500-word sections and three insights — and a model that takes that instruction at its word
needs several times 2000 tokens before it reaches `# Response`. The measurement generalised
from a model that answered tersely. Where a provider also ignores `reasoning: { enabled:
false }`, the larger budget absorbs that too; the `finish_reason` now carried in the error
says which case a failure is.

No reduction in the prompt's demands accompanies this, so the change is one variable.

### 2026-10-17 — Reasoning is turned off for every model

A reply failed with `OpenRouter returned no content for model deepseek/deepseek-v4.1-flash`.
The model was answering: it spent every one of the 2000 tokens of `LLM_MAX_TOKENS` on private
reasoning, hit `finish_reason: length`, and returned `content: null` before writing a word of
the document the prompt asked for. The throw added when Oblique posted a blank reply caught it
exactly as intended — it named the model but not the reason, which is why the failure read as a
mystery.

Every request now carries `reasoning: { enabled: false }` (D-15), and the no-content error
names the `finish_reason` alongside the model. ONTOLOGY's LLM client response rule gains the
flag and the fuller message; R-35 gains both to its Given and Expect. `LLM_MAX_TOKENS` is
unchanged — with reasoning off, 2000 is ample for the seven-section document.

### 2026-10-17 — `rotate` ships false

`config-example.json` had `rotate: true`, so a fresh install would speak with a different
model every day without being asked. It now ships false, matching what the live config was
already set to: the first entry in `models` is used until someone turns the walk on. D-5 still
stands — the daily rotation is the design — but it is now something you opt into rather than
the out-of-the-box behaviour. The voice rotation in `genders` is unaffected and still daily.

With the walk off, the first entry is the whole choice, so `~deepseek/deepseek-flash-latest`
leads the list in both the template and the live config. It was already first by accident of
the order the list was imported in; it is now first on purpose.

### 2026-10-17 — The build step is removed; `tsc` is `noEmit` and only type-checks

`npm run build` was `tsc && vite build`, and the two halves did not feed each other. `tsc`
wrote 112 files into `dist/` — a `.js`, `.js.map`, `.d.ts` and `.d.ts.map` per source file —
and `vite build`, with `emptyOutDir: true`, deleted all of them before emitting its own four.
Nothing `tsc` produced was ever read; only its exit code mattered. And nothing read Vite's
output either: there is no deploy target, no CI, and `dist/` is gitignored, so the bundle was
built for a reader that does not exist.

Removed: `build`, `start` (`vite preview`, which only served the bundle) and `clean` (`rimraf
dist`) from `package.json`, along with the `main` and `types` entries pointing into `dist/`;
the `build`, `preview` and `clean` recipes from the justfile; and the `build` block from
`vite.config.ts`. `just check` is now `typecheck test`, which no longer type-checks twice.
`tsconfig.json` gains `noEmit` and loses `outDir`, `declaration`, `declarationMap` and
`sourceMap`, so `npx tsc` cannot write `dist/` by accident.

This was anticipating a requirement rather than meeting one. Add a build back the day there is
somewhere to deploy to; it is four lines. `rimraf` is left in `devDependencies` rather than
churn the lockfile for one unused entry.

### 2026-10-17 — Model list refreshed from yuwakisagpt, preferring floating `~*-latest` aliases

The list was the one carried over from the original hardcoded map — Claude Sonnet 4.5, GPT-5,
Gemini 2.5 Pro, Llama 3.x. `/work/yuwakisagpt/yuwakisagpt/static/js/yuwakisa.js` keeps a
maintained one, so `config-example.json` now takes its OpenRouter entries with the
`OpenRouterApi:` / `OpenRouterBaseApi:` prefixes stripped. Every slug was checked against
`https://openrouter.ai/api/v1/models` and all of them exist.

Entries with a `~` prefix are kept as written. They looked like hand-marked exclusions at
first, since nothing in yuwakisagpt strips the character — but `~` is OpenRouter's own prefix
for a floating "latest" alias, and the catalog lists `~google/gemini-pro-latest` and
`~moonshotai/kimi-latest` while the un-prefixed forms do not exist.

Left out: `google/gemini-3-pro-image-preview`, whose output modalities are `['image', 'text']`
and which would produce one unusable reply per cycle; `TopologyApi:topology-tiny`, not an
OpenRouter model; and a commented-out Mistral entry.

Every dated slug with a floating equivalent is replaced by it, so 10 of the 23 entries now
track their vendor's releases rather than being re-pinned by hand: both DeepSeek tiers, Gemini
flash and pro, Kimi, GLM, and the two added below. Google's three dated flash entries —
`gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash` — collapse into one
`~google/gemini-flash-latest`, which costs the flash-lite tier as a distinct voice. Qwen,
Nvidia, Mistral, Arcee and the Venice Dolphin publish no alias and stay pinned; they will go
stale and need this pass repeating.

`~deepseek/deepseek-v4-flash-latest` is left out: it floats within v4 rather than across
majors, so it would overlap with `~deepseek/deepseek-flash-latest` and put two slots in the
rotation that can resolve to the same model.

`~anthropic/claude-sonnet-latest`, `~openai/gpt-sol-latest`, `~openai/gpt-mini-latest` and
`~openai/gpt-terra-latest` bring Anthropic and OpenAI back in. The OpenAI tiers are codenames
rather than sizes, so they were read by price: luna $0.10, mini $0.75, sol and terra $2.00,
astra $10.00 per Mtok in. Sol matches Sonnet's $2.00 in / $10.00 out exactly, so the two are a
like-for-like comparison across vendors; terra sits at the same input with $12.00 out, and
mini a tier below at $0.75. Three OpenAI entries against one Anthropic is deliberate — the
daily walk lands on OpenAI three times per cycle, at two price points, which is the spread
D-5's comparison wants. Luna and astra are left out as the extremes.

Before these two, Anthropic and OpenAI had left the
rotation entirely. Nothing from the pre-refresh list survives. D-5's claim that the rotation
is perceptible (X-5) is still unmeasured, and this is a larger change to it than any tuning so
far.

### 2026-10-17 — `DEFAULT_CONFIG` removed; `config.json` carries every value

Configuration was a `DEFAULT_CONFIG` object in `src/config.ts` with `config.json` deep-merged
over it. Answering "what is this actually running with" meant reading both and applying the
merge rules in your head — and those rules had a wrinkle, since `deepMerge` merges objects but
assigns arrays, so `models` replaced while `openrouter` merged. The defaults are now the
contents of `config-example.json`, which is tracked, and `config.json` is the whole
configuration.

`loadConfigWithFallbacks` becomes `loadConfig`: fetch, parse, return, with `{}` and a warning
on any failure so the page still loads and says it is unconfigured. There is nothing left to
merge, so `src/utils/deep-merge.ts` is deleted along with its only caller, and
`test/utils/index.test.ts` goes with the `DEFAULT_CONFIG` it asserted.

The trade is explicit and recorded in D-4: a partial `config.json` is no longer valid. A file
missing `openrouter.models` makes the daily model throw; one missing `ignoreList` makes the
restraint gate throw. That is the point — a field absent from the file is absent at runtime
rather than quietly supplied from somewhere else. `config-example.json` now carries all 15
model slugs so a fresh copy works.

R-19 is rewritten for the new contract. `npm test` runs 17 suites and 156 tests.

### 2026-10-17 — `CONSTRAINTS.md` renamed to `CRITERIA.md`

The `ontology_spec` skill names the doc set ONTOLOGY / CRITERIA / RATIONALE /
ARCHITECTURE_LOG. This repo had called the second one `CONSTRAINTS.md` since the conversion
from SPEC.md, for no reason anyone could name — the content was always the skill's CRITERIA:
R/U/X tables, the four Instrument forms, a dated Status section. The name also read wrong,
suggesting limits the system must respect rather than the checks that say it is right. Only
the name changed; no row, ID or instrument moved. The earlier conversion entry below still
says CONSTRAINTS, which is what the file was called on that date.

The second divergence from the skill stands: there is no `RATIONALE.md`, and the D-n decisions
live in this file above the history. Splitting them back out is a real change rather than a
rename, and the single file is working.

### 2026-10-17 — The model list moves to `config.json`; `rotate` replaces `model`

`prompts/oblique.ts` held a hardcoded map of 15 OpenRouter slugs to display names that nothing
read. It is now `openrouter.models` in `config.json`, an array of slugs. (It landed first in
a `DEFAULT_CONFIG` that `config.json` merged over; the entry below removes that layer.)

`openrouter.rotate` replaces `openrouter.model`. True keeps the daily walk; false always takes
`models[0]`, so pinning a model means reordering the list rather than setting a second field
that could contradict it. `getDailyModel` throws when the list is empty instead of inventing a
model.

Removing `openrouter.model` removed the fallback that `openrouter.ts` used when a request named
no model, so `LLMConfig` loses `model`, `LLMRequest.model` becomes required, and the reply path
now passes `getDailyModel()` the way the chat path already did. That settles Q-9, which existed
because the reply path logged the daily model and then quietly used the config one.

R-12 gains the pin and the empty-list error; R-19 covers list replacement. `npm test` runs 18
suites and 159 tests.

### 2026-10-17 — Oblique posted an empty reply; two silent coercions removed

A reply went out with `text: ""`. Two places turned "no content" into a value that looked
fine. `openrouter.ts` ended `generateResponse` with `data.choices[0]?.message?.content || ''`,
so a 200 carrying an empty `choices` array, a null `content`, or a model that spent its token
budget before emitting anything became an empty string reported as success. Nothing
downstream disagreed: `extractResponseContent('')` returns null, `null || ''` is `''`, `''` is
under the length gate, and `blueskyClient.post({ text: '' })` is accepted by Bluesky without
complaint.

The client now throws `OpenRouter returned no content for model <model>`, which lands the
chain in `dead` with the model named — useful, since D-5 rotates through 15 of them and this
is the kind of fault one model has and the others do not. `createPostReplyTask.process()`
also refuses blank text as its first guard clause, before the like, so the invariant holds
whatever produced the text.

Both were instances of the inline-default habit the conventions warn about: supplying `''`
for a missing value turns a loud failure into a quiet wrong answer. R-16 is now `automated`
and covers the refusal; R-35 is new for the client. `npm test` runs 18 suites and 151 tests.

### 2026-10-17 — The Configure panel loses its fields; `config.json` is the only source

The panel's save had never worked: `configurePanel.ts` read
`config.openrouter?.baseUrl.openrouter.baseUrl`, and since `baseUrl` is a string, `.openrouter`
was undefined and the final `.baseUrl` threw (U-8). The fix landed first, briefly followed by
remembering `{ apiKey, model }` in `localStorage` so a key typed into the panel survived a
reload. Both are now removed in favour of the simpler answer: there is one place configuration
comes from. A writable second source would mean a precedence rule, a browser copy that can go
stale against the file, and an API key in `localStorage` for any script on the origin to read —
for a file that has to exist anyway.

`src/configurePanel.ts` and `src/credentials.ts` are deleted and the panel is now three
paragraphs of prose: where `config.json` lives, that it is gitignored so the key and app
password stay out of the repository, and where to get a key. `index.ts` no longer binds
`#save-config`. Settles half of Q-10 and closes `cfgsave-5vpt` by removing the code it was
about; D-14 is untouched, since nothing is persisted at all.

`loadConfigWithFallbacks` also stopped logging the whole merged config, which printed the API
key to the console on every load, and split the fetch into `mergeConfigFile` so the warning
paths read in one place.

R-19 is now `automated` rather than a gap. U-8 is retired, with U-9 covering the panel as a
note. `npm test` runs 17 suites and 140 tests.

### 2026-10-17 — `dadabot.ts` renamed to `dadabot.md`; `npm run build` is green

The file was never TypeScript: a Markdown prompt saved with a `.ts` extension, on which `tsc`
reported 399 syntax errors, so `npm run build` never reached Vite. Renaming it
`src/prompts/dadabot.md` leaves `npx tsc --noEmit` clean. Nothing imported it, so no code
changed and the 135 tests pass unchanged; it now sits beside `system.20251016.1012.txt`, which
already holds prompt material that is not code. This settles the build half of Q-12 and leaves
the persona question open there.

Building on Linux also needed `@rollup/rollup-linux-x64-gnu` and `@esbuild/linux-x64`:
`node_modules/` had been installed from Windows and carried only the `win32-x64` binaries.
That is a checkout artifact rather than a repo defect, and is now noted in the README.

### 2026-10-17 — ONTOLOGY / CONSTRAINTS / ARCHITECTURE_LOG.md replace SPEC.md and its companions

Converted five overlapping documents into this set. `SPEC.md`, `TASK_THREADING.md`,
`src/drakidion/README.md`, `src/drakidion/SPEC.md` and `src/drakidion/FUTURE.md` were deleted;
`README.md` was reduced to getting-started and pointed here. Behavior was not changed and no
source file was touched: the docs now describe the code as it is.

Where the old documents disagreed with the code, **the code won** and the disagreement is
recorded here rather than silently fixed in either direction:

1. `SPEC.md` described `src/drakidion/queue.ts`, `pending-map.ts` and `agent.ts`. Those were
   `src/core/queue.ts`, `pending-map.ts` and `agent.ts`, deleted on 2025-10-11. The live
   modules are `task-queue.ts`, `waiting-set.ts` and `orchestrator.ts`.
2. `SPEC.md` described a `Storage` interface and `src/storage/memory-storage.ts`. Both were
   deleted on 2025-10-11. Nothing is persisted (D-14).
3. `SPEC.md`'s `createAgent`, `processMessage`, `processMessageAndWait`, `addTask` and
   `getAgentStatus` do not exist. The live interface is `ONTOLOGY.md` §7.
4. `SPEC.md`'s task types `process_message | send_llm_request | send_bluesky_post |
   return_response` are used by nothing. The live chains are the reply chain and the chat
   chain.
5. `SPEC.md` and `README.md` required conversation ids to be UUID v4. `generateConversationId`
   produces 24-char safe-base32 and is itself unreferenced (D-3, Q-1).
6. `README.md` claimed "two task orchestration systems". There is one.
7. `README.md` referenced `DRAKIDION.md`, `DRAKIDION_IMPLEMENTATION.md`,
   `IMPLEMENTATION_SUMMARY.md` and `src/examples/drakidion-demo.ts`. None exists; the demo was
   deleted on 2025-10-21.
8. `src/drakidion/README.md` described a "WaitingMap" doing correlation tracking. The code has
   a `WaitingSet` of task ids, and a stray byte-identical `waiting-map.ts` (Q-2).
9. `src/drakidion/SPEC.md` required rejecting stale async responses. The code does not (Q-4).
10. `src/drakidion/SPEC.md` required `doneAt` on every terminal snapshot. `processNextTask`'s
    catch path omits it. Tracked as `doneat-76kf`.
11. `src/drakidion/SPEC.md` required a version increment on every successor. The `running`
    snapshot deliberately keeps the predecessor's version; it is a marker, not a step. The
    ontology now says so rather than leaving it as a contradiction.
12. Both `SPEC.md` and `README.md` listed test files that do not exist (`queue.test.ts`,
    `pending-map.test.ts`, `agent.test.ts`, `memory-storage.test.ts`) and counts that no
    longer hold. `npm test` runs 16 suites.
13. Bot attenuation, the thread-length cap, `ignoreList`/`botList`, the daily model rotation,
    alt-text handling, quote-post history, liking before replying and the whole polling loop
    were in the code and in no specification at all. They are now rules in `ONTOLOGY.md`.

`src/drakidion/FUTURE.md`'s requirements and the unbuilt `MUST`s from `src/drakidion/SPEC.md`
became `[D, unbuilt]` in the ontology with `not yet covered` rows R-25 … R-33, so the deferred
design stays in the reference instead of in a file nobody reads.

Twelve open questions (Q-1 … Q-12) were raised by the mapping, including five genuine defects
found while reading: the configure panel's save path, `window.oblique.getState`'s `require`
in an ES module, the reply path ignoring the daily model, `createReplyTask` spreading
`conversation` *before* `newReadyTask`, whose `conversation: undefined` overwrites it, and
`src/prompts/dadabot.ts` breaking `npm run build`. None was fixed here; conversion and repair
are separate changes.

Every open question and defect above is now a tracker ticket, prioritized 90 down to 20:
`buildbreak-4s8x`, `cfgsave-5vpt`, `postconfirm-t9r8`, `stalecb-k59i`, `dailymodel-t46y`,
`dupwaitset-tu5f`, `doneat-76kf`, `waitleak-duk4`, `replylen-6a9i`, `convoclob-bynk`,
`namenums-vnzy`, `deadtypes-mrsf`, `errwait-rwzm`, `getstate-viig`. Q-6 (prompt injection) has
no ticket because it is a decision for the designer, not a repair.

The only source files touched were four comments rewritten to cite stable IDs instead of
carrying history: `drakidion-types.ts` no longer points at the deleted DRAKIDION spec,
`utils/index.ts` no longer calls its unused generators "legacy … for backward compatibility",
and the `TODO` in `oblique-task-factory.ts` and the "for now" in `bluesky-polling.ts` now cite
Q-8 and D-6. `npm test` passes unchanged.

### 2025-11-16 — Bluesky panel and polling tests

Test coverage extended to the polling toggle and the notification/thread restraint gates.
Suite reaches its current 16 files.

### 2025-10-26 — `src/prompts/dadabot.ts` added

A second persona prompt, never wired to anything (Q-12).

### 2025-10-22 — Bot attenuation

`botList` added to the config and `skipForBotAttenuation` to `shouldRespondToThread`: stop
replying when a known bot holds `BOT_ATTENUATION_LIMIT` of the last `BOT_WINDOW` posts and
spoke last. Added after bot-to-bot exchanges showed no natural stopping point. Established
D-7; the `THREAD_MAX_POSTS` backstop predates it.

### 2025-10-21 — `createTaskFromFunction`; demo removed

`src/drakidion/functions.ts` added a builder that wraps a plain function as a task chain.
`src/examples/drakidion-demo.ts` deleted, leaving `README.md` pointing at a file that no
longer existed until today.

### 2025-10-19 — Config file, daily rotation, quote history; the waiting-set split

Four changes landed together:

- `src/config.ts` and `src/utils/deep-merge.ts`: `config.json` fetched at startup and merged
  over `DEFAULT_CONFIG`, replacing hardcoded values. Established D-4.
- `getDailyModel` and `getDailyGender`: a 15-model, 25-entry rotation keyed to the day.
  Established D-5.
- `getQuotedHistory`: quote posts get the quoted post as history rather than being treated as
  bare mentions. Part of D-8.
- `waiting-set.ts` added beside `waiting-map.ts` and the orchestrator repointed at it. The old
  file was never deleted and its test never moved, which is Q-2.

`src/drakidion/SPEC.md` and `FUTURE.md` were written the same day, splitting the orchestration
requirements into built and deferred. Both are superseded by today's entry.

### 2025-10-16 — Like before replying

`BlueskyClient.like` added and called from the post-reply task ahead of the post. Established
D-13.

### 2025-10-15 — Notification restraint

`src/bluesky-polling.ts` added with `shouldRespondToNotification` and `config.ignoreList`:
the first gate, before any thread fetch. Established D-6.

### 2025-10-14 — Alt text in history

Image alt text carried through `BlueskyHistoryEntry` and rendered into the prompt as its own
`  image:` line, so a post whose content is a captioned image is no longer invisible to the
model. Part of D-8.

### 2025-10-13 — Task id threading; the reply chain

Replaced per-step unique ids with **(taskId, version) chain identity**: a chain mints one
`taskId` and every successor inherits it with an incremented version, so sorting a chain's
snapshots by version reproduces its execution trace. Added `nextTask`, `newReadyTask` and
`newWaitingTask` as the only sanctioned way to build a snapshot. `src/oblique-task-factory.ts`
added the three-step reply chain on top of it. Established the §2 identity invariants and
D-2's tracing argument; documented at the time in `TASK_THREADING.md`, superseded today.

### 2025-10-11 — DRAKIDION replaces the agent architecture

The structural rewrite. The agent model — an `Agent` owning a queue, a pending map and a
storage layer — was removed and replaced by a task orchestration system with no agent in it:
`TaskMap` (latest snapshot per chain), `TaskQueue` (ready chains, FIFO), `WaitingSet` (chains
awaiting a callback) and a single `requestAnimationFrame` worker loop. Deleted
`src/core/agent.ts`, `src/core/queue.ts`, `src/core/pending-map.ts`,
`src/storage/storage-interface.ts` and `src/storage/memory-storage.ts`; `src/core/` became
`src/drakidion/`. Safe-base32 ids arrived with it.

Why: the agent was a stateful object that owned scheduling, persistence and conversation at
once, and every new behavior had to be threaded through it. Tasks and chains made each step an
independent value, which is what D-2 and D-14 record. The types in `src/types/index.ts`
survived the rewrite unused and are Q-1.

`SPEC.md` and `README.md` were not updated to match, which is the root of most of today's
discrepancy list.

### 2025-10-09 — First implementation

Agent-based conversation processing: `src/core/{agent,queue,pending-map}.ts`, a `Storage`
interface with an in-memory implementation, the OpenRouter client, the Bluesky client, the
oblique prompt module and `src/types/index.ts`. Described by the original `SPEC.md`.

### 2025-10-08 — Repository created
