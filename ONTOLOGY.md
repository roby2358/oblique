# Oblique — Ontology

This is the implementation reference: what exists, what each thing carries, and how it
behaves. It describes the **current state only**. Every *why*, every alternative considered
and every dated change lives in `ARCHITECTURE_LOG.md`; every check that proves a rule lives in
`CRITERIA.md`.

**Tags**

- **[D]** decided by the designer.
- **[D, unbuilt]** decided but not in the code yet.
- **[P]** proposed, pending review. Never treat a [P] as settled.
- **[T]** tunable number, expected to change under measurement.
- **Serves:** which §0 goal or quality the item exists for.
- **IDs:** goals `G-n`, decisions `D-n` (in `ARCHITECTURE_LOG.md`), criteria `R-n`/`U-n`/`X-n`
  (in `CRITERIA.md`). Cite IDs, never section numbers.

---

## §0 Purpose **[D]**

Oblique is a browser-resident bot that answers Bluesky mentions obliquely — through
supertext, subtext, architext and psychotext — and knows when to say nothing at all. It runs
entirely as a single web page: no server, no database, no background process.

### Qualities

- **Oblique** — a reply reframes rather than answers. It is insight, not information.
- **Terse** — one or two sentences, inside a hard character budget.
- **Literate** — allusion to literature and history, including the obscure, in plain language.
- **Restrained** — the bot's most common correct action is not to post.
- **Inspectable** — at any moment a human can open a panel and see every task, its chain, its
  version and its state.

### Goals

- **G-1 Reply obliquely.** Each reply reads as a lateral observation on the post in its thread.
- **G-2 Never spam.** Restraint rules decide when *not* to post; a skipped reply is a success.
- **G-3 Stay inspectable.** Task state is visible and traceable by `taskId` at all times.
- **G-4 Stay small.** One page, one event loop, no server, no persistence layer to operate.
- **G-5 Stay sequential.** One task at a time, so behavior is reproducible and debuggable.

### Priorities when goals conflict

**G-2 > G-1 > G-3 > G-5 > G-4.** Restraint beats wit: a suppressed reply costs nothing, a
spammed thread costs the account. Inspectability beats throughput — the system is slow on
purpose. Smallness yields last: it is a constraint on the design, not a reason to drop a
restraint rule.

### Non-goals (for now)

- Durability. State lives in one tab's memory. Closing the tab discards everything in flight,
  and that is the intended behavior, not a defect.
- Concurrency of any kind — no parallel tasks, no multiple tabs, no leader election.
- Multi-turn memory of its own. Context comes from the Bluesky thread on each pass.
- Exactly-once posting. Nothing fences a duplicate post.

---

## §1 Entities

### 1.1 DrakidionTask

The unit of work. An **immutable snapshot** of one step in a chain; a step never mutates
itself, it returns its successor. Behavior is carried in a closure on `process`.
*Serves:* G-3, G-5.

| Field | Type | Notes |
|---|---|---|
| `taskId` | `string` | 24-char safe-base32. Shared by every snapshot in a chain. |
| `version` | `number` | Starts at 1, increments per successor. |
| `status` | `TaskStatus` | See §3. |
| `description` | `string` | Human-readable, shown in the UI panels. |
| `work` | `string` | The work product being built — a draft reply, an error message, a posted URI. |
| `process` | `() => DrakidionTask` | Synchronous. Returns the successor snapshot. |
| `conversation?` | `ConversationMessage[]` | LLM message history carried along the chain. |
| `retryCount?` | `number` | Declared; nothing reads or writes it. **[D, unbuilt]** |
| `createdAt?` | `Date` | Set on the first snapshot, preserved across the chain. |
| `doneAt?` | `Date` | Set when a snapshot reaches a terminal status. |

### 1.2 TaskMap

`{ tasks: Map<taskId, DrakidionTask> }`. Mutable. Holds exactly the **latest** snapshot per
chain; earlier snapshots are discarded, not archived. *Serves:* G-3, G-4.

### 1.3 TaskQueue

`{ taskIds: string[] }`. Mutable FIFO array of chains whose latest snapshot is `ready`. A
convenience index over TaskMap, kept so the loop never scans the map. *Serves:* G-5.

### 1.4 WaitingSet

`{ waitingTaskIds: Set<string> }`. Mutable set of chains whose latest snapshot is `waiting`
on an external callback. One entry per chain, because a chain has one `taskId`.
*Serves:* G-3.

### 1.5 OrchestratorState

| Field | Type | Notes |
|---|---|---|
| `taskMap` | `TaskMap` | §1.2 |
| `taskQueue` | `TaskQueue` | §1.3 |
| `waitingSet` | `WaitingSet` | §1.4 |
| `isRunning` | `boolean` | Whether the `requestAnimationFrame` loop is live. |

The whole world. Held at module level in `panels.ts`, recreated on every reconfigure.
*Serves:* G-3, G-4.

### 1.6 BlueskyMessage

A notification, normalized from the AT Protocol shape. *Serves:* G-1, G-2.

| Field | Type | Notes |
|---|---|---|
| `uri`, `cid` | `string` | AT Protocol identity of the post. |
| `author` | `string` | Handle, no leading `@`. |
| `text` | `string` | Post text. |
| `createdAt` | `Date` | From `indexedAt`. |
| `reason` | `string` | `mention`, `reply`, `quote`, `like`, `repost`, … |
| `replyInfo?` | `{ root, parent }` | Each `{ uri, cid }`. Absent on a top-level post. |

### 1.7 BlueskyHistoryEntry

`{ author, text, altTexts? }`. One post as the LLM will see it. A thread is an array of these
in chronological order, oldest first, with the post being answered last. Image alt text is
carried because it is part of what was said. *Serves:* G-1.

### 1.8 ConversationMessage

`{ role, content }`. The LLM wire format.

### 1.9 Config

Loaded once from `/config.json`, deep-merged over `DEFAULT_CONFIG`, held mutable at module
level. It is the only source of configuration: the UI sets nothing and the browser stores
nothing. *Serves:* G-2, G-4.

| Field | Type | Notes |
|---|---|---|
| `openrouter.apiKey` | `string` | Empty means the LLM is unconfigured and no task is created. |
| `openrouter.models` | `string[]` | OpenRouter slugs, `MODEL_ROTATION_SIZE` of them by default. A list in `config.json` replaces it rather than merging into it. Empty is an error, not a default. |
| `openrouter.rotate` | `boolean` | True walks the list one entry per UTC day; false always uses the first entry. |
| `openrouter.baseUrl` | `string` | OpenRouter chat-completions endpoint. |
| `bluesky.handle` | `string` | The bot's own handle. |
| `bluesky.password` | `string` | App password. |
| `ignoreList` | `string[]` | Handles never replied to. |
| `botList` | `string[]` | Handles treated as bots for attenuation (see the thread-restraint rule). |

### 1.10 Dead vocabulary

`src/types/index.ts` also declares `Task`, `PendingTask`, `Conversation`, `StorageData`,
`TaskId`, `UserId` and `ConversationId`. **Nothing imports them.** They are the vocabulary of
a superseded design; only `BlueskyMessage`, `BlueskyPost`, `LLMRequest` and `LLMResponse` are
live. Removing them is tracked as an open question in `ARCHITECTURE_LOG.md`.

---

## §2 Invariants

- Every snapshot in a chain shares one `taskId`; only a chain's first snapshot mints a new one.
- `version` starts at 1 and increases by exactly 1 per successor. Versions within a chain form
  `1, 2, 3, …` with no gaps and no reuse.
- `createdAt` is set on the first snapshot and preserved unchanged down the chain.
- `doneAt` is set when and only when a snapshot's status is terminal (`succeeded`, `dead`,
  `canceled`).
- TaskMap holds at most one snapshot per `taskId`, and it is the latest.
- Every `taskId` in TaskQueue or WaitingSet has an entry in TaskMap.
- A chain is in TaskQueue **or** WaitingSet **or** neither — never both.
- A chain in TaskQueue has latest status `ready`; a chain in WaitingSet has latest status
  `waiting`. Terminal snapshots sit in TaskMap alone.
- Exactly one task is processed at a time. There is no concurrency and no reentrancy.
- `taskId` is 24 characters drawn from `abcdefghijkmnpqrstuvwxyz23456789` — a–z plus 2–9, with
  `l`, `1`, `o` and `0` excluded so an identifier can be read aloud and retyped.
- `process` is synchronous. Asynchronous work is started as a side effect and resolved through
  the resume path, never awaited inside `process`.
- The core (`src/drakidion/`) never reads the DOM, Bluesky or the LLM. Those arrive as
  injected clients through the closures in `src/oblique-task-factory.ts`.

---

## §3 Task state machine

Statuses: `ready`, `running`, `waiting`, `succeeded`, `retry`, `dead`, `canceled`.
Terminal: `succeeded`, `dead`, `canceled`.

```
ready ──► running ──► succeeded        (work done)
                ├──► waiting           (external call in flight)
                ├──► ready             (next step, re-queued)
                └──► dead              (threw, or the step failed)

waiting ──► ready | succeeded | dead   (via the resume path, from a callback)
```

`retry` and `canceled` are declared and routed as non-queued, non-waiting statuses; no rule
currently produces either. **[D, unbuilt]**

Where a snapshot lands is decided entirely by its status: `ready` → TaskQueue, `waiting` →
WaitingSet, anything else → TaskMap only.

---

## §4 Rules

### 4.1 Chain succession — `nextTask`, `newReadyTask`, `newWaitingTask` **[D]**

*Serves:* G-3. The sole mechanism for identity across a chain.

```
newReadyTask(description)   -> { taskId: fresh(24), version: 1, status: ready,
                                 createdAt: now, work: '', process: throws }
newWaitingTask(description) -> same, status: waiting, work: 'Waiting...'
nextTask(prev)              -> { taskId: prev.taskId, version: prev.version + 1,
                                 status: ready, description, work, conversation,
                                 createdAt: prev.createdAt, process: throws }
createSucceededTask(prev)   -> { ...nextTask(prev), status: succeeded, doneAt: now }
createDeadTask(prev)        -> { ...nextTask(prev), status: dead,      doneAt: now }
```

Each returns a base to be spread over; the caller supplies `work` and `process`. The stub
`process` throws, so a successor that forgets to define one fails loudly rather than silently
doing nothing.

A convenience builder wraps a plain function as a one-step chain. It is public API of the
orchestration layer; no application code uses it today.

```
createTaskFromFunction(description, fn) -> { ...newReadyTask(description), process }
  process():
    try:    partial = fn()
            -> { ...createSucceededTask(base), ...partial,
                 taskId, version, doneAt from the successor,      # never overridable
                 status: partial.status ?? 'succeeded' }
    catch:  -> createDeadTask(base) with work + '\n[Function failed: …]'
```

### 4.2 Admitting a task — `addTask` **[D]**

*Serves:* G-5.

```
addTask(state, task):
  taskMap.set(task.taskId, task)
  if task.status == 'ready'   -> taskQueue.push(task.taskId)
  if task.status == 'waiting' -> waitingSet.add(task.taskId)
  # terminal statuses are recorded in the map and nowhere else
```

### 4.3 Replacing a snapshot — `transitionTask` **[D]**

*Serves:* G-5, and the "one place only" invariant.

```
transitionTask(state, oldTaskId, successor):
  taskQueue.remove(oldTaskId)      # if present
  waitingSet.delete(oldTaskId)     # if present
  addTask(state, successor)
```

Clearing both structures before admitting the successor is what keeps a chain from appearing
in the queue and the waiting set at once.

### 4.4 Processing one task — `processNextTask` **[D]**

*Serves:* G-5.

```
processNextTask(state):
  taskId = taskQueue.shift();            if none        -> { processed: false }
  task   = taskMap.get(taskId);          if missing     -> warn, { processed: false }
  if task.status != 'ready'              -> warn, { processed: false }
  taskMap.set(taskId, { ...task, status: 'running' })   # same version
  try:    successor = task.process()
          transitionTask(state, taskId, successor)
  catch:  taskMap.set(taskId, { ...task, status: 'dead', version: version + 1,
                                work: work + '\n[ERROR: …]' })
  -> { processed: true }
```

The `running` snapshot deliberately keeps the predecessor's version: it is a marker that work
is in flight, not a step in the chain. The catch path does **not** set `doneAt`, which
contradicts the §2 invariant — see the open question in `ARCHITECTURE_LOG.md`.

### 4.5 Draining the queue — `processAllTasks` **[D]**

```
while queue not empty:
  r = processNextTask(state)
  if not r.processed: break        # a refusal stops the drain, it does not spin
```

### 4.6 The worker loop — `startLoop` **[D]**

*Serves:* G-4, G-5. Scheduling is the browser's job.

```
startLoop(state, onStateChange):
  if state.isRunning -> warn, return a no-op stop
  state.isRunning = true
  loop():
    if stopRequested -> isRunning = false; return
    if queue not empty:
        processNextTask(state); onStateChange(state)
    requestAnimationFrame(loop)
  requestAnimationFrame(loop)
  return { state, stop }
```

One task per animation frame at most. The loop dies with the tab, which is the whole of the
lifecycle design.

### 4.7 Resuming from a callback — `resumeWaitingTask`, `errorWaitingTask` **[D]**

*Serves:* G-3, G-5.

```
resumeWaitingTask(state, taskId, successor):
  if not taskMap.has(taskId) -> warn, waitingSet.delete(taskId), return state
  waitingSet.delete(taskId)
  transitionTask(state, taskId, successor)
```

`errorWaitingTask` is byte-identical. The distinction is in the successor the caller hands
over — a dead snapshot rather than a ready one — not in the orchestrator.

This rule does **not** check that the chain was in the WaitingSet, so a stale or repeated
callback is accepted and transitions the chain again. Flagged in `ARCHITECTURE_LOG.md`.

### 4.8 Notification restraint **[D]**

*Serves:* G-2. The first, cheap gate. Runs per notification, before any task exists.

```
shouldRespondToNotification(notif, postData):
  if config.ignoreList includes notif.author                          -> false
  if notif.reason == 'quote' and handle not in notif.text             -> false
  if notif.reason == 'mention'                                        -> TRUE   # always
  thread = postData.data.thread
  if thread missing or $type != 'app.bsky.feed.defs#threadViewPost'   -> false  # deleted
  if thread.replies is non-empty                                      -> false  # beaten to it
  -> true
```

A direct mention is answered unconditionally — it was addressed to the bot, so someone else
having replied is irrelevant. Everything else defers: an unparseable post is treated as
deleted, and an existing reply means the conversation no longer needs the bot.

### 4.9 Thread restraint **[D]**

*Serves:* G-2. The second gate, after the full thread is in hand.

```
shouldRespondToThread(thread):
  if thread empty                                     -> null
  if skipForBotAttenuation(thread)                    -> null
  if thread.length > THREAD_MAX_POSTS                 -> null
  -> thread

skipForBotAttenuation(thread):
  recent = last BOT_WINDOW authors (normalized)
  last   = recent[-1]
  if last not in config.botList -> false              # humans are never attenuated
  -> count(recent == last) >= BOT_ATTENUATION_LIMIT
```

Two bots can otherwise answer each other forever. The limit only engages when a *bot* spoke
last, so a human can carry a long exchange without being throttled.

### 4.10 History assembly — `getHistory` **[D]**

*Serves:* G-1. Three shapes of notification, three ways to build context.

```
getHistory(notif):
  if notif.reason == 'quote'       -> getQuotedHistory(notif)    # [quoted post, the quote]
  if no notif.replyInfo.parent.uri -> getOnePostHistory(notif)   # [quoted?, the post]
  -> getThreadHistory(notif, THREAD_MAX_DEPTH)                   # ancestors…, the post
```

`getThreadHistory` walks `parent` links upward from the parent post, reverses to chronological
order, then appends the notification itself so the post being answered is always last. Every
fetch failure degrades to `[{ author, text }]` rather than aborting: a missing ancestor costs
context, not the reply. A deleted post is logged at debug, not as a warning — it is the normal
case, not an error.

### 4.11 Conversation construction **[D]**

*Serves:* G-1.

```
createObliqueConversation(thread):
  if thread is null -> null                      # the restraint gates' refusal, carried through
  posts        = thread.map(p => "@author: text" + one "  image: alt" line per altText)
  userMessage  = posts[-1]
  threadHistory = posts[0..-2] joined by newline
  -> [ { role: 'system', content: systemPrompt },
       { role: 'user',   content: obliquePrompt(userMessage, threadHistory) } ]
```

`null` in, `null` out: a refusal from either restraint gate propagates through the promise
chain as `null` and silently ends the chain without a post.

### 4.12 Lens and voice selection **[D]**

*Serves:* G-1, and the *literate* quality.

```
getRandomTextLens() -> uniform pick of { supertext, subtext, architext, psychotext }
dailyCircularKey(n) -> floor(now / 86400s) mod n
getDailyModel():
  models = config.openrouter.models
  if models is empty -> throw "No models configured"
  if not config.openrouter.rotate -> models[0]
  -> models[dailyCircularKey(|models|)]
getDailyGender()    -> genders[dailyCircularKey(|genders|)]
```

The lens is per reply, so a thread does not settle into one register. Model and voice are per
*day*, so the bot has a consistent character for a day and a different one tomorrow. The
`genders` array is weighted by repetition rather than by probability — male and female recur
through it, so the daily cycle lands on them more often while still reaching every entry.

The model list lives in `config.openrouter.models`, not in code, so it is deployment data like
the API key. `config.openrouter.rotate` turns the daily walk off: with it false the first entry
is always used, which makes pinning a model a matter of reordering the list rather than editing
a second field that could disagree with it. Both LLM paths name the model on the request —
there is no config-level model to fall back to, so a request can never go out unnamed.

### 4.13 Response extraction **[D]**

*Serves:* G-1. The prompt asks for a markdown document; only one section is postable.

```
extractResponseContent(content):
  m = content.match(/# Response\s*\n?(.*)/s)
  if no match -> null
  -> m[1].trim() with leading/trailing backticks stripped
```

### 4.14 Length retry and truncation **[D]**

*Serves:* G-1, and the *terse* quality.

```
generateLLMResponseWithRetry(client, conversation, maxAttempts = LLM_MAX_ATTEMPTS):
  if conversation is null -> null                    # restraint refusal, carried through
  repeat up to maxAttempts:
    response = await client.generateResponse({ conversation,
                                               temperature: LLM_TEMPERATURE,
                                               maxTokens: LLM_MAX_TOKENS })
    text = extractResponseContent(response.content) or response.content
    if text.length < REPLY_LENGTH_GATE -> return text
  -> truncateAtLastPunctuation(text)                 # last attempt only

truncateAtLastPunctuation(text):
  if text.length <= MAX_BLUESKY_REPLY_CHARS -> text
  scan backwards from MAX_BLUESKY_REPLY_CHARS - 1 for a character in
      { . ! ? , : ; — – … ( \n }
  if found at i >= 1 -> text[0..i)                   # the mark itself is dropped
  -> text[0..MAX_BLUESKY_REPLY_CHARS)
```

Asking again is preferred to cutting, because a model that overran once usually complies on
the retry and a cut sentence reads as a failure. Truncation is the floor, not the plan, and it
cuts at a boundary rather than mid-word.

### 4.15 Reply threading — `notificationReplyTo` **[D]**

*Serves:* G-1.

```
notificationReplyTo(message):
  root   = message.replyInfo?.root ?? { uri: message.uri, cid: message.cid }
  parent = { uri: message.uri, cid: message.cid }
  -> { root, parent }
```

Replying inside an existing thread keeps that thread's root; replying to a top-level post
makes that post the root. The parent is always the post being answered, so the reply lands
directly under it.

### 4.16 Posting the reply **[D]**

*Serves:* G-1.

```
createPostReplyTask(...).process():
  if replyText.trim() is empty                       # nothing to say is not a reply
    -> createDeadTask(task) with work = "Failed to post: Refusing to post an empty reply"
  try:
    replyTo = blueskyClient.notificationReplyTo(originalNotification)
    blueskyClient.like(originalNotification.uri)     # not awaited
    blueskyClient.post({ text: replyText, replyTo }) # not awaited
    -> createSucceededTask(task) with work = "Posted: <text> (reply-posted)"
  catch:
    -> createDeadTask(task) with work = "Failed to post: <message>"
```

Blank text is refused before the like, not after: Bluesky accepts an empty post without
complaint, so nothing downstream would catch it. The chain goes `dead` so the refusal is
visible in the observer panel rather than silent.

The like precedes the post: an acknowledgement should land even if the reply does not. Because
`process` is synchronous and neither call is awaited, the snapshot succeeds on *dispatch*, not
on confirmation — a rejected post leaves a `succeeded` chain and the placeholder URI
`reply-posted`. Tracked in `ARCHITECTURE_LOG.md`.

### 4.17 The reply chain **[D]**

*Serves:* G-1, G-3. Three snapshots, one `taskId`.

```
v1  createReplyTask          ready    process() -> v2
v2  createSendToLLMTask      waiting  side effect: getHistory
                                        -> shouldRespondToThread
                                        -> createObliqueConversation
                                        -> generateLLMResponseWithRetry
                                        -> onWaitingTaskComplete(taskId, v3)
                                      on reject -> onWaitingTaskComplete(taskId, dead v3)
v3  createPostReplyTask      ready    process() -> succeeded | dead v4
```

The promise chain is started inside `createSendToLLMTask` and the waiting snapshot is returned
immediately, so the orchestrator never blocks. A `null` anywhere in the chain (either restraint
gate) means `sendReply` logs and returns without calling back — the chain stays `waiting`
forever and is garbage only when the tab closes. Deliberate: a refusal is not a failure, and
there is no "abandoned" status to move it to.

### 4.18 The chat chain **[D]**

*Serves:* G-1, G-3. A single waiting snapshot, used by the chat panel for manual testing.

```
v1  createObliqueMessageTask waiting  side effect: generateResponse({ model: getDailyModel(),
                                                                     temperature, maxTokens })
                                        -> succeeded v2, work = extracted response
                                      on reject -> dead v2, work = "Error: …"
```

No restraint gates apply — a human typed it, so it is always answered. No length retry either:
the response is shown in the page, not posted.

### 4.19 Configuration load **[D]**

*Serves:* G-2, G-4.

```
loadConfigWithFallbacks():
  result = structuredClone(DEFAULT_CONFIG)
  try:  r = await fetch('/config.json')
        if r.ok -> deepMerge(result, await r.json())
        else    -> warn
  catch: warn
  -> result
```

Deep-merged over defaults so a partial `config.json` is valid: a file that sets only an API
key still gets the default model and base URL. A missing or malformed file is a warning, not a
failure — the page loads unconfigured and says so.

One source, loaded once. The Configure panel is a note explaining where `config.json` lives
and that it is gitignored; it has no fields and writes nothing. A configuration change means
editing the file and reloading the page.

### 4.20 The LLM client response **[D]**

*Serves:* G-1.

```
generateResponse(request):
  r = await fetch(config.baseUrl, { model, messages, temperature, max_tokens })
  if not r.ok -> throw "OpenRouter API error: <status> <body>"
  content = r.json().choices[0]?.message?.content
  if content is not a non-blank string
    -> throw "OpenRouter returned no content for model <model>"
  -> { content, model, usage }
```

A 200 carrying no usable content — an empty `choices` array, a null `content`, a model that
spent its budget before emitting any — is a failure, not an empty reply. Throwing lands the
chain in `dead` with the model named, where returning `''` would travel all the way to a blank
post.

### 4.21 Authentication refresh — `ensureAuth` **[D]**

*Serves:* G-4. Called before every Bluesky operation.

```
ensureAuth():
  if not authenticated or isTokenExpired() -> authenticate()

isTokenExpired(now):
  if no tokenExpiresAt -> true
  -> tokenExpiresAt <= now + TOKEN_REFRESH_BUFFER_MS

authenticate():
  authenticated = false; tokenExpiresAt = null      # clear before trying
  await agent.login({ identifier: handle, password: appPassword })
  authenticated = true
  tokenExpiresAt = exp claim of the session JWT, else now + TOKEN_DEFAULT_TTL
```

Refreshing early, rather than on a 401, avoids losing a reply to a token that expired mid-call.
State is cleared before the attempt so a failed login cannot leave the client believing it is
authenticated.

### 4.22 Not yet built **[D, unbuilt]**

Designed, deliberately deferred, each with a `not yet covered` row in `CRITERIA.md` so the
gap stays visible:

- **Persistence.** TaskMap, TaskQueue and WaitingSet backed by IndexedDB; every snapshot
  persisted before completion is acknowledged; restore on reload and resume `ready` tasks;
  idempotent restore.
- **Retries and backoff.** `retryCount` and a `lastError` on the snapshot; exponential backoff
  with jitter; `retry → ready`; `dead` past `MAX_ATTEMPTS`.
- **Waiting timeouts.** Each waiting snapshot registers a safety timeout; expiry transitions it
  to `retry`. Without this, rule 4.17's refusal path leaks a waiting entry.
- **Scheduling metadata.** `priority` and `nextRunAt`; a priority queue ordered by
  `(priority DESC, nextRunAt ASC)` dequeuing only tasks whose `nextRunAt ≤ now`.
- **Backpressure.** Stop promoting tasks above a queue-depth threshold, resume below it; adapt
  the poll interval to load.
- **Transition validation.** Reject invalid transitions such as `succeeded → running`.
- **Idempotency fence.** An `effects` set per snapshot, checked before any external action, so a
  retry cannot double-post.
- **Leader election.** `BroadcastChannel` plus a heartbeat in `localStorage` with an expiry, so
  exactly one tab runs the loop and the others may only submit. Supersedes the §0 non-goal on
  concurrency if built.
- **Terminal-task pruning.** TTL-based purge of terminal snapshots from the map and storage.
- **Metrics hooks.** Counts of ready/in-flight/retried tasks and average latency, exposed for
  monitoring.

---

## §5 Automation

### 5.1 The notification poller **[D]**

*Serves:* G-1, G-2. The only actor that creates work without a human. It is subject to every
rule a human-triggered path is subject to.

```
startPolling():
  interval = clamp(#poll-interval value, POLL_MIN_S, POLL_MAX_S) else POLL_DEFAULT_S
  schedule():
    setTimeout(interval):
      if still polling: await checkNotifications(); schedule()

checkNotifications():
  if no blueskyClient or no llmClient -> show the reason, stop
  await blueskyClient.ensureAuth()
  notifs = await getNotifications(NOTIFICATION_BATCH, unreadOnly = true)
  if none -> stop
  render notifs
  if #mark-as-seen -> await markNotificationsAsSeen()      # once, for the whole batch
  for each notif:
    postData = await getSinglePost(notif.uri)
    if not shouldRespondToNotification(notif, postData): continue
    addTask(state, createReplyTask(notif, llmClient, blueskyClient, onWaitingTaskComplete))
  report created and filtered counts
```

The poller's information is exactly what the Bluesky API returns for unread notifications —
it has no memory of what it saw last pass. Marking as seen happens before the per-notification
loop so a mid-loop failure cannot cause the same batch to be reprocessed forever.

`onWaitingTaskComplete` is the bridge back into the orchestrator: the LLM promise calls it with
`(taskId, successor)`, and it invokes rule 4.7 and refreshes the status display.

---

## §6 Numbers **[T]**

Every one of these is tunable. **Refer to a constant by name everywhere else** — code, docs and
tests. The code is the single source; the value here is a copy.

| Name | Value | Unit | Where | Decision |
|---|---|---|---|---|
| `MAX_BLUESKY_REPLY_CHARS` | 299 | characters | `oblique-task-factory.ts` | D-9 |
| `REPLY_LENGTH_GATE` | 300 | characters | `generateLLMResponseWithRetry` | D-9 |
| `LLM_MAX_ATTEMPTS` | 5 | attempts | `generateLLMResponseWithRetry` | D-9 |
| `LLM_TEMPERATURE` | 0.8 | — | both LLM paths | D-10 |
| `LLM_MAX_TOKENS` | 2000 | tokens | both LLM paths | D-10 |
| `OPENROUTER_FALLBACK_TEMPERATURE` | 0.7 | — | `openrouter.ts` | D-10 |
| `OPENROUTER_FALLBACK_MAX_TOKENS` | 500 | tokens | `openrouter.ts` | D-10 |
| `THREAD_MAX_POSTS` | 60 | posts | `shouldRespondToThread` | D-7 |
| `BOT_WINDOW` | 8 | posts | `skipForBotAttenuation` | D-7 |
| `BOT_ATTENUATION_LIMIT` | 4 | posts | `skipForBotAttenuation` | D-7 |
| `THREAD_MAX_DEPTH` | 25 | ancestors | `getHistory` | D-8 |
| `NOTIFICATION_BATCH` | 3 | notifications | `checkNotifications` | D-11 |
| `POLL_DEFAULT_S` | 60 | seconds | `getPollIntervalSeconds` | D-11 |
| `POLL_MIN_S` | 10 | seconds | `getPollIntervalSeconds` | D-11 |
| `POLL_MAX_S` | 3600 | seconds | `getPollIntervalSeconds` | D-11 |
| `TASK_ID_LENGTH` | 24 | characters | `generateTaskId` | D-3 |
| `SAFE_BASE32_ALPHABET` | `abcdefghijkmnpqrstuvwxyz23456789` | — | `safebase32.ts` | D-3 |
| `TOKEN_REFRESH_BUFFER_MS` | 300000 | ms (5 min) | `BlueskyClient` | D-12 |
| `TOKEN_DEFAULT_TTL` | 86400000 | ms (1 day) | `getDefaultTokenExpiration` | D-12 |
| `MODEL_ROTATION_SIZE` | 15 | models | `DEFAULT_CONFIG.openrouter.models`, overridable in `config.json` | D-5 |
| `GENDER_ROTATION_SIZE` | 25 | entries | `prompts/oblique.ts` | D-5 |
| `DEFAULT_MODEL` | `anthropic/claude-3.5-haiku` | — | `DEFAULT_CONFIG` | D-4 |

Only `MAX_BLUESKY_REPLY_CHARS`, `TOKEN_REFRESH_BUFFER_MS`, `SAFE_BASE32_ALPHABET` and
`DEFAULT_CONFIG` are named constants in the code today; the rest are literals at their use
site. Naming them is an open question in `ARCHITECTURE_LOG.md`.

---

## §7 Commands, queries and events

The boundary between the core and anything that drives it. The UI is the only client today;
the shape is what a second client would have to speak.

### 7.1 Orchestrator commands

| Command | Legal when | Effect | Side effects |
|---|---|---|---|
| `createOrchestrator()` | always | Returns empty state. | none |
| `addTask(state, task)` | always | Records in TaskMap; routes by status (4.2). | none |
| `transitionTask(state, old, successor)` | always | Clears `old` from queue and waiting set, admits `successor` (4.3). | none |
| `processNextTask(state)` | always | Runs the head of the queue (4.4). | whatever `process` does |
| `processAllTasks(state)` | always | Drains the queue (4.5). | as above |
| `startLoop(state, onStateChange?)` | `!state.isRunning` | Starts the rAF loop; returns `{ state, stop }`. | schedules frames |
| `resumeWaitingTask(state, taskId, successor)` | always | Resumes a chain (4.7). | none |
| `errorWaitingTask(state, taskId, successor)` | always | Identical to resume (4.7). | none |

Every command returns the state object. **The state is mutated in place** — the returned
reference is the same object, not a copy. Callers reassign by convention, not because they must.
This is the one place the system is not functional, and it is why there is exactly one
orchestrator per page.

Illegal input never throws: a missing task, a wrong status or an empty queue produces a
`console.warn` and `{ processed: false }`.

### 7.2 Queries

| Query | Returns |
|---|---|
| `getStatus(state)` | `{ isRunning, queueSize, waitingSize, totalTasks }` |
| `TaskMapOps.getAllTasks(map)` | every latest snapshot |
| `TaskMapOps.getTasksByStatus(map, status)` | latest snapshots with that status |
| `TaskQueueOps.getAllTaskIds(queue)` | queued ids, FIFO order (a copy) |
| `WaitingSetOps.getAllWaitingTaskIds(set)` | waiting ids |
| `window.oblique.getState()` | `{ orchestrator, hasLLM, hasBluesky }` — console debugging |

### 7.3 Events

There is no event bus. Three callbacks carry everything:

| Callback | Fields | Who learns of it |
|---|---|---|
| `onStateChange(state)` | the whole state | `panels.ts`, which refreshes the status line |
| `onWaitingTaskComplete(taskId, successor)` | chain id, next snapshot | the orchestrator, via 4.7 |
| `task.process()` return | successor snapshot | the orchestrator, via 4.4 |

### 7.4 Client contract

- A client may call §7.1 commands and §7.2 queries, and may read any snapshot field.
- A client must not mutate a snapshot, nor reach into `taskMap.tasks`, `taskQueue.taskIds` or
  `waitingSet.waitingTaskIds` directly — the `*Ops` modules are the only writers.
- A client must not call `process()` itself. Only rule 4.4 may.
- A client must create tasks through the factories in §4.1, never by building a literal: the
  factories are the only thing that enforces the §2 identity invariants.
- Asynchronous work belongs in a factory closure, returning a `waiting` snapshot and resuming
  through `onWaitingTaskComplete`. Nothing may await inside `process`.
