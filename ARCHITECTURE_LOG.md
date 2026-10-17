# Oblique — Architecture Log

The only document in this set that carries *why* and *when*. `ONTOLOGY.md` and
`CONSTRAINTS.md` describe the current state and nothing else; everything historical — what a
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

### D-4 One `config.json`, deep-merged over defaults — *Decided*

- **Alternatives:** environment variables through Vite's `import.meta.env`; `localStorage`;
  a settings UI as the source of truth.
- **Why:** the page is served statically and has no build step per deployment, so a file
  fetched at startup is the only thing that can be changed without rebuilding. Deep-merging
  means a `config.json` that sets only an API key is valid. Serves G-4.
- **Evidence:** none. R-19 is not yet covered.

### D-5 Model and voice rotate daily; the lens rotates per reply — *Decided*

- **Alternatives:** a fixed model; a random model per reply; a model chosen by thread length
  or cost.
- **Why:** a per-reply model makes the bot incoherent within a conversation. A fixed model
  makes it monotonous across weeks. Day-granularity gives it a consistent character for a day
  and a different one tomorrow, which also turns the rotation into a cheap comparison across
  15 models on identical traffic. The `genders` array is weighted by repetition rather than by
  probability — male and female recur through it so the daily cycle lands on them more often
  while still reaching every entry — because an array index is the whole mechanism and a
  weights table would be more machinery than the effect is worth. Serves G-1.
- **Evidence:** none. X-5 is unmeasured.

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
- **Evidence:** `npm test` — R-14 covers truncation in detail; the retry loop is not covered.

### D-10 LLM parameters are set per call site, not per client — *Decided*

- **Alternatives:** one set of parameters in `LLMConfig`; parameters in `config.json`.
- **Why:** the OpenRouter client carries conservative fallbacks (temperature 0.7, 500 tokens)
  so a bare call is safe, and each call site overrides them for what it needs — both Oblique
  paths ask for temperature 0.8 and 2000 tokens because the prompt demands a long document at
  some creative temperature. The fallbacks exist for a future call site that has not been
  written.
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
- **Why:** the like is the acknowledgement and should land even if the reply does not. Since
  neither call is awaited, ordering the dispatch this way is the only control available over
  which happens first. Serves G-1.
- **Evidence:** none. R-16 is not yet covered.

### D-14 No persistence, deliberately — *Decided*

- **Alternatives:** IndexedDB from the start; `localStorage`; a server.
- **Why:** persistence is the feature that drags in every other one — serialization (which
  closures block, see D-2), restore semantics, idempotency so a restored task cannot
  double-post, pruning so storage does not grow without bound. A tab's memory has none of
  those problems, and losing in-flight work when the tab closes costs at most one unposted
  reply. Serves G-4; the whole of R-25 … R-33 is the deferred bill.
- **Evidence:** none.

### Deliberately left out

- **Multi-turn memory of its own.** Context is re-read from the Bluesky thread on every pass.
  A thread is already the conversation log; keeping a second copy would make the two disagree.
- **Agents.** The 2025-10-11 rewrite removed the concept; tasks and chains cover it. Do not
  reintroduce an entity that owns a queue.
- **A storage interface.** Removed 2025-10-11 and not missed. Its presence implied a
  persistence story that did not exist (D-14).
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
are imported by nothing. They are the vocabulary of the pre-2025-10-11 design.
**Recommendation:** delete them, keeping `BlueskyMessage`, `BlueskyPost`, `LLMRequest` and
`LLMResponse`. Risk is zero — the TypeScript build proves nothing imports them.

### Q-2 `waiting-map.ts` duplicates `waiting-set.ts` — *tracked as `dupwaitset-tu5f`*

The two files are byte-identical. `orchestrator.ts` imports `waiting-set.ts`;
`test/drakidion/waiting-map.test.ts` imports `waiting-map.ts`. So the module under test is not
the module in use. **Recommendation:** delete `waiting-map.ts`, point the test at
`waiting-set.ts`, and rename it `waiting-set.test.ts`.

### Q-3 `errorWaitingTask` is identical to `resumeWaitingTask` — *tracked as `errwait-rwzm`*

Both do exactly the same thing; the difference is only in the successor the caller passes.
**Recommendation:** keep both names — the call sites read better — but make
`errorWaitingTask` delegate, so the duplication cannot drift. Alternatively give it a real
difference: assert the successor is terminal.

### Q-4 Stale callbacks are accepted — *tracked as `stalecb-k59i`*

`resumeWaitingTask` checks TaskMap but not the WaitingSet, so a repeated or late callback
transitions a chain that is no longer waiting. `src/drakidion/SPEC.md` required rejecting
these; the code never did. **Recommendation:** return unchanged when `isWaiting(taskId)` is
false, and add the case to R-7. This is the kind of defect that produces a double post once
the posting path is awaited.

### Q-5 Refused chains leak a WaitingSet entry — *tracked as `waitleak-duk4`*

When either restraint gate returns `null`, `sendReply` logs and returns without calling
`onWaitingTaskComplete`. The chain stays `waiting` forever — harmless today because nothing
scans the set and the tab clears it, but it means `waitingSize` overstates real work.
**Recommendation:** add a `canceled` successor on the refusal path, which is what the status
exists for. R-27's timeout would also catch it, less precisely.

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

### Q-8 Posting succeeds on dispatch, not on confirmation — *tracked as `postconfirm-t9r8`*

`createPostReplyTask.process()` is synchronous and awaits neither `like` nor `post`, so the
chain reports `succeeded` with the placeholder URI `reply-posted` even when the post is
rejected. The code carries a `TODO` saying so. **Recommendation:** make it a waiting task that
resumes from the post promise, like the LLM step already does. This is the single largest gap
between what the task graph claims and what happened.

### Q-9 The reply path ignores the daily model — *tracked as `dailymodel-t46y`*

`createSendToLLMTask` logs `getDailyModel()` and then calls the LLM without a `model`, so the
Bluesky path uses `config.openrouter.model` while the chat path uses the daily rotation. One
of the two is wrong. **Recommendation:** pass the daily model on the reply path — the rotation
exists for the public replies, which is where D-5's comparison value lies.

### Q-10 Two configure-panel defects — *tracked as `cfgsave-5vpt` and `getstate-viig`*

`configurePanel.ts` reads `config.openrouter?.baseUrl.openrouter.baseUrl`, which throws
because `baseUrl` is a string — saving configuration from the UI always fails (U-8).
Separately, `index.ts`'s `window.oblique.getState` calls `require()` inside an ES module
bundle and will throw in the browser. Both are bugs, not design questions; they are here
because the conversion found them. **Recommendation:** fix both as a separate change.

### Q-11 The reply-length numbers disagree — *tracked as `replylen-6a9i`*

`MAX_BLUESKY_REPLY_CHARS` is 299, the retry gate gives up at 300, and the system prompt says
"less than 279 characters" in one line and "299 characters or less" in another. A test is
named for a 279 limit that no longer exists. **Recommendation:** pick one number, name it, and
interpolate it into the prompt rather than restating it.

### Q-12 `src/prompts/dadabot.ts` breaks the build — *tracked as `buildbreak-4s8x`*

The file is a Markdown prompt — a second persona, "the ghost of Tristan Tzara reborn in a
machine" — saved with a `.ts` extension. It is not TypeScript, it is imported by nothing, and
because `npm run build` is `tsc && vite build`, `tsc` fails on it and the build never reaches
Vite. `npm test` passes only because Jest compiles what is imported. **Recommendation:**
rename it `dadabot.md`, or make it a `.ts` file exporting the prompt as a string the way
`oblique.ts` does — then decide whether it is a planned second persona or dead material.

Separately, `createTaskFromFunction` is exported from `drakidion.ts` and tested but used by no
application code. **Recommendation:** keep it as public API of the orchestration layer and say
so, as `ONTOLOGY.md` now does.

---

## History

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
