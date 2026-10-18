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
| `work` | `string[]` | The work product, one line per step — a draft reply, an error message, a posted URI. Every step **appends**; none replaces what an earlier step wrote, so the list is the chain's trace. `latestWork` reads the last line. |
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

Loaded once from `/config.json` and held mutable at module level. That file is the whole
configuration: there are no defaults in code, the UI sets nothing and the browser stores
nothing, so every value the page uses can be read in one place. A field missing from the file
is missing at runtime — `config-example.json` is the complete template to copy. *Serves:* G-2,
G-4.

| Field | Type | Notes |
|---|---|---|
| `openrouter.apiKey` | `string` | Empty means the LLM is unconfigured and no task is created. |
| `openrouter.models` | `string[]` | OpenRouter slugs, `MODEL_ROTATION_SIZE` of them in the template. Empty or absent is an error, not a default. |
| `openrouter.rotate` | `boolean` | False, the shipped default, always uses the first entry. True walks the list one entry per UTC day. |
| `openrouter.baseUrl` | `string` | OpenRouter chat-completions endpoint. |
| `bluesky.handle` | `string` | The bot's own handle on Bluesky's own network. |
| `bluesky.password` | `string` | Account password, or an app password issued by the PDS named beside it. |
| `bluesky.service` | `string` | `https://bsky.social`. |
| `bluesky.appview` | `string` | `did:web:api.bsky.app#bsky_appview`. |
| `bluesky.lexicon` | `string` | `app.bsky`. |
| `delvetown.handle` | `string` | The bot's own handle on delve.town. |
| `delvetown.password` | `string` | Account password, or an app password issued by the PDS named beside it. |
| `delvetown.service` | `string` | `https://pds.delve.town`. |
| `delvetown.appview` | `string` | `did:web:api.delve.town#bsky_appview`. |
| `delvetown.lexicon` | `string` | `town.delve`. |
| `ignoreList` | `string[]` | Handles never replied to. Applies to every account. |
| `botList` | `string[]` | Handles treated as bots for attenuation (see the thread-restraint rule). Applies to every account. |

`bluesky` and `delvetown` are **account sections**, and the set of them is the one list
`ACCOUNT_SECTIONS` in `src/bluesky-accounts.ts`. A third network is an entry there plus a
section here, and nothing else: no other code asks which network it is on (D-22). A section
left blank is not an account and is passed over; a section half filled in is a typo and is
named in the console instead.

### 1.10 BlueskyAccount

One network Oblique answers on. *Serves:* G-1, G-4.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | The config section it came from, which is how a half filled in section is named when it is refused. No other application code reads it: the panel and the log identify an account by its handle. |
| `handle` | `string` | The bot's own handle there, without a leading `@`. The restraint rules are asked with this, because each network knows Oblique by a different name. |
| `client` | `BlueskyClient` | Signed in at that section's `service`, reading through its `appview` and speaking its `lexicon`. Every task the account's notifications create carries this client through to the reply, so a reply always goes back to the network it came from. |

A network is three things, and they are independent: **where the repository lives**
(`service`), **who answers reads about it** (`appview`), and **what the records are called**
(`lexicon`). Bluesky and delve.town differ in all three. delve.town is not a Bluesky PDS with
another hostname — it is a separate application network whose lexicon is a fork of
`app.bsky.*` under `town.delve.*`, sharing only the DID (D-23).

Accounts are built once at startup and never change. There is no "current" account: the
poller visits all of them and they all feed the one task queue, so the orchestrator never
learns that there is more than one network.

### 1.11 Dead vocabulary

`src/types/index.ts` also declares `Task`, `PendingTask`, `Conversation`, `StorageData`,
`TaskId`, `UserId` and `ConversationId`. **Nothing imports them.** They are the vocabulary of
a superseded design; only `BlueskyMessage`, `BlueskyPost`, `LLMRequest` and `LLMResponse` are
live. Three generators in `src/utils/index.ts` are unreferenced for the same reason —
`generateConversationId`, `generateId` and `wait` — as is `generateCorrelationId`, which the
barrel exports and the tests exercise but no application code calls. `BlueskyClient`'s
`hasRepliesToPost` is live code with no caller: the notification gate reads the thread's
`replies` itself. Removing all of it is Q-1 in `ARCHITECTURE_LOG.md`.

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

waiting ──► ready | succeeded | dead | canceled   (via the resume path, from a callback)
```

`canceled` is what a restraint rule produces: terminal, but neither a success nor a failure,
because nothing was done and nothing went wrong (D-24). `retry` is declared and routed as a
non-queued, non-waiting status, and no rule produces it. **[D, unbuilt]**

Where a snapshot lands is decided entirely by its status: `ready` → TaskQueue, `waiting` →
WaitingSet, anything else → TaskMap only.

---

## §4 Rules

### 4.1 Chain succession — `nextTask`, `newReadyTask`, `newWaitingTask` **[D]**

*Serves:* G-3. The sole mechanism for identity across a chain.

```
newReadyTask(description)   -> { taskId: fresh(24), version: 1, status: ready,
                                 createdAt: now, work: [], process: throws }
newWaitingTask(description) -> same, status: waiting, work: []
nextTask(prev)              -> { taskId: prev.taskId, version: prev.version + 1,
                                 status: ready, description, work, conversation,
                                 createdAt: prev.createdAt, process: throws }
createSucceededTask(prev)   -> { ...nextTask(prev), status: succeeded, doneAt: now }
createDeadTask(prev)        -> { ...nextTask(prev), status: dead,      doneAt: now }
```

Each returns a base to be spread over; the caller supplies `process` and a `work` list made of
the base's lines plus its own. The base states every field, `conversation` included, so it is
spread *first* and the caller's fields follow it — a field written before the spread is
silently overwritten by the base's default. Both factories start a chain with no lines at all, so the first
line of a chain is written by the factory that starts it. The stub `process` throws, so a
successor that forgets to define one fails loudly rather than silently doing nothing.

A convenience builder wraps a plain function as a one-step chain. It is public API of the
orchestration layer, exported from `drakidion.ts`; no application code uses it today.

```
createTaskFromFunction(description, fn) -> { ...newReadyTask(description), process }
  process():
    try:    partial = fn()
            -> { ...createSucceededTask(base), ...partial,
                 taskId, version, doneAt from the successor,      # never overridable
                 status: partial.status || 'succeeded' }
    catch:  -> createDeadTask(base) with work + ['[Function failed: …]']
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
                                work: [...work, '[ERROR: …]'] })
  -> { processed: true }
```

The `running` snapshot deliberately keeps the predecessor's version: it is a marker that work
is in flight, not a step in the chain. The catch path does **not** set `doneAt`, which
contradicts the invariant on terminal snapshots — tracked as `doneat-76kf`.

`processNextTask`, `processAllTasks` and the loop body are declared `async` and return
promises, although nothing inside them awaits: `process` is synchronous, so the promise
resolves in the same turn. Whether to keep the shape is Q-13 in `ARCHITECTURE_LOG.md`.

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
  if not taskMap.has(taskId)       -> warn, waitingSet.delete(taskId), return state
  if not waitingSet.has(taskId)    -> warn, return state unchanged
  waitingSet.delete(taskId)
  transitionTask(state, taskId, successor)
```

`errorWaitingTask` is the same function under another name — identical apart from its
comments. The distinction is in the successor the caller hands over — a dead snapshot rather
than a ready one — not in the orchestrator.

Only a chain that is *currently* waiting can be resumed. A callback that arrives twice, or
after the chain has already settled, finds the chain gone from the WaitingSet and is logged
and dropped, so a terminal snapshot is never overwritten and finished work is never
re-queued (D-17).

### 4.8 Notification restraint **[D]**

*Serves:* G-2. The first, cheap gate. Runs per notification, before any task exists.

```
REPLIABLE_REASONS = { mention, reply, quote }

isRepliableNotification(notif) -> notif.reason in REPLIABLE_REASONS

needsPostData(notif) -> isRepliableNotification(notif) and notif.reason != 'mention'

notificationRestraintReason(notif, postData, selfHandle):
  if not isRepliableNotification(notif) -> 'a <reason> names no post to answer'
  if config.ignoreList includes notif.author
                                        -> 'the author is in the ignore list'
  if notif.reason == 'quote' and selfHandle not in notif.text
                                        -> 'a quote that does not name us'
  if notif.reason == 'mention'          -> null            # always answered
  reason = postUnreadableReason(postData)
  if reason                             -> reason          # say which
  if postData.data.thread.replies is non-empty
                                        -> 'someone already replied to this post'
  -> null                                                  # answer it

postUnreadableReason(postData):
  thread = postData?.data?.thread
  if thread missing                     -> 'the post could not be fetched'
  kind = fragment of thread.$type after '#', or '' when there is none
  if kind == 'threadViewPost'           -> null                       # readable
  if kind == 'notFoundPost'             -> 'the post is gone'
  if kind == 'blockedPost'              -> 'the post is blocked, by us or by its author'
  -> 'the thread came back as <$type>'
```

Only a `mention`, `reply` or `quote` names a post. A `like`, `repost` or `follow`
notification's `uri` is that like, repost or follow record, so there is nothing to answer and
`getPostThread` refuses it with a 400. `isRepliableNotification` is split out and offline so
the poller can ask before it fetches, and `needsPostData` is what the poller actually asks:
a mention is answered whatever the post says, so its thread read is skipped too.

`selfHandle` is the handle of the account the notification arrived on, passed in rather than
read from config: Oblique answers on several networks and each knows it by a different name,
so the quote test has to be made against the right one (D-22). `ignoreList` is global, and
deliberately so — an account not worth answering on one network is not worth answering on
another.

A direct mention is answered unconditionally — it was addressed to the bot, so someone else
having replied is irrelevant. Everything else defers: a post that cannot be read is left
alone, and an existing reply means the conversation no longer needs the bot.

The kinds are matched on the fragment of the `$type` rather than the whole of it, because
each network namespaces its own copy of the union: `app.bsky.feed.defs#blockedPost` and
`town.delve.feed.defs#blockedPost` are the same case (D-23).

A post that cannot be read is not the same as a deleted one, and the four reasons are named
rather than guessed at: `#notFoundPost` is gone, `#blockedPost` is a perfectly good post
behind a block in one direction or the other, a missing thread means the fetch itself failed
(`fetchPostData` logged why), and any other `$type` is reported as itself. All four refuse,
but the reason says which.

Every reason is author-free, so the panel can count how many notifications each one declined
and print the tally instead of a line per notification; the author belongs to the console
line the poller writes beside it (D-25).

### 4.9 Thread restraint **[D]**

*Serves:* G-2. The second gate, after the full thread is in hand.

```
threadRestraintReason(thread):
  if thread empty                       -> 'the thread came back empty'
  reason = botAttenuationReason(thread)
  if reason                             -> reason
  if thread.length > THREAD_MAX_POSTS   -> 'the thread is <n> posts long'
  -> null                                                     # answer it

botAttenuationReason(thread):
  recent = last BOT_WINDOW authors (normalized)
  last   = recent[-1]
  if last not in config.botList -> null               # humans are never attenuated
  n = count(recent == last)
  if n < BOT_ATTENUATION_LIMIT  -> null
  -> '@<last> wrote <n> of the last <BOT_WINDOW> posts'
```

Two bots can otherwise answer each other forever. The limit only engages when a *bot* spoke
last, so a human can carry a long exchange without being throttled, and it counts that one
author rather than bots in general — three bots in rotation never trip it, two alternating do.

The reason is named rather than answered with a boolean, as at the first gate: it becomes the
last line of the declined chain's work product, so the Observer panel says which rule declined
a reply and about whom (D-24).

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

`obliquePrompt` orders its text least volatile first, so that a provider's prefix cache keeps
as much of it as the next request allows: the fixed mission, then the voice (one value per UTC
day), then the lens (one of four, drawn per reply), then the thread history, then the message
being answered, then a three-line restatement of the task. Every request that day shares the
fixed text; a request that draws the same lens shares that too. The lens sits above the thread
rather than below it because consecutive replies usually belong to *different* threads, so
four possible lens blocks are cached more often than one thread's history. The closing
restatement is fixed text in the least cacheable position, deliberately: it is there for
recency, and it is short because it is paid for on every request.

The output format is stated once, as a fenced skeleton under `# Output format` in
`systemPrompt`: `# Thinking`, `# Related Western`, `# Related Eastern`, `# Insight 1` … `3`,
`# Response`, with no section count to disagree with the list. `systemPrompt` carries no
interpolation beyond `ADVERTISED_REPLY_CHARS` and is the same string for every request on both
call sites, so the format sits in the longest fixed prefix there is.

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
the API key. `config.openrouter.rotate` turns the daily walk off, and ships false: the first
entry is used until someone says otherwise, which makes pinning a model a matter of reordering
the list rather than editing a second field that could disagree with it. The rotation is there
to be switched on deliberately, not to surprise a fresh install with a different voice each
day. Both LLM paths name the model on the request —
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
    if text.length <= MAX_BLUESKY_REPLY_CHARS -> return text
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

`MAX_BLUESKY_REPLY_CHARS` is the only limit the code enforces — the gate above and the
truncation point are the same number. The prompt asks the model for `ADVERTISED_REPLY_CHARS`
instead, and every place it states a limit interpolates that constant: the `MUST` line and
the `# Response` section's length in `systemPrompt`, and the same section's length in
`obliquePrompt`.

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
    -> createDeadTask(task) with work + ["Failed to post: Refusing to post an empty reply"]
  try:
    replyTo = blueskyClient.notificationReplyTo(originalNotification)
    blueskyClient.like(originalNotification.uri)     # not awaited; a rejection is logged
    blueskyClient.post({ text: replyText, replyTo })
      .then(result -> onWaitingTaskComplete(taskId,
              createSucceededTask(task) with work + ["Posted: <result.uri>"]))
      .catch(error -> onWaitingTaskComplete(taskId,
              createDeadTask(task) with work + ["Failed to post: <message>"]))
    -> waiting successor, work unchanged             # the reply text is already its last line
  catch:
    -> createDeadTask(task) with work + ["Failed to post: <message>"]
```

Blank text is refused before the like, not after: Bluesky accepts an empty post without
complaint, so nothing downstream would catch it. The chain goes `dead` so the refusal is
visible in the observer panel rather than silent.

The like precedes the post and is not awaited: an acknowledgement should land even if the
reply does not, and a rejected like is logged rather than carried into the chain. The post is
awaited — the snapshot succeeds on *confirmation*, carrying the URI Bluesky returned, and a
rejected post leaves a `dead` chain. A throw before the post is dispatched (resolving the
reply target, or the client failing synchronously) is caught here and yields `dead` without a
waiting snapshot.

### 4.17 The reply chain **[D]**

*Serves:* G-1, G-3. Five snapshots, one `taskId`.

```
v1  createReplyTask          ready    process() -> v2
v2  createSendToLLMTask      waiting  side effect: runReplyChain
                                        getHistory
                                        -> threadRestraintReason
                                           if declined -> onWaitingTaskComplete(taskId,
                                                            canceled v3); stop here
                                        -> createObliqueConversation
                                        -> generateLLMResponseWithRetry
                                        -> onWaitingTaskComplete(taskId, v3)
                                      on reject -> onWaitingTaskComplete(taskId, dead v3)
v3  createPostReplyTask      ready    process() -> v4
                                      refusal or a throw before dispatch -> dead v4
v4  (post in flight)         waiting  side effect: like, then post
                                        -> onWaitingTaskComplete(taskId, succeeded v5)
                                      on reject -> onWaitingTaskComplete(taskId, dead v5)
```

v1 carries the notification text as its `conversation`, a single `user` message, so the
Waiting and Observer panels show what the chain is answering; v2 inherits it. The
conversation actually sent to the model is rebuilt from the fetched thread by
`createObliqueConversation` and reaches the chain on v3. Because `newReadyTask` supplies a
`conversation` of its own (`undefined`), v1 spreads the factory base *first* and states its
own fields after it.

Both promise chains are started inside the factory and the waiting snapshot is returned
immediately, so the orchestrator never blocks.

A refusal ends the chain where the refusal is made. `runReplyChain` asks the second gate as
soon as the thread is in hand and, if it is declined, completes the chain with a `canceled`
successor carrying the reason — before the conversation is built, so a declined reply never
costs an LLM call. The gate's answer is acted on once rather than carried onward as a `null`
for each later stage to re-check, and the chain leaves the WaitingSet, so the waiting count
counts work actually in flight (D-24).

### 4.18 The chat chain **[D]**

*Serves:* G-1, G-3. A single waiting snapshot, used by the chat panel for manual testing.

```
v1  createObliqueMessageTask waiting  side effect: generateResponse({ model: getDailyModel(),
                                                                     temperature, maxTokens })
                                        -> succeeded v2, work + [extracted response]
                                      on reject -> dead v2, work + ["Error: …"]
```

No restraint gates apply — a human typed it, so it is always answered. No length retry either:
the response is shown in the page, not posted. When the model answers without a `# Response`
section the chain still succeeds, carrying the literal line
`error extracting response content`. The caller may override `LLM_TEMPERATURE` through an
optional argument; the chat panel, its only caller, does not.

### 4.19 Configuration load **[D]**

*Serves:* G-2, G-4.

```
loadConfig():
  try:  r = await fetch('/config.json')
        if r.ok -> return await r.json()
        else    -> warn, return {}
  catch: warn, return {}
```

One file, loaded once, used as written. Nothing is merged over it and nothing is merged into
it, so what the page runs on is exactly what the file says — the cost of hunting through two
sources to answer "what model is it using" was judged higher than the convenience of partial
files. A field left out is absent at runtime, not defaulted: `openrouter.models` missing makes
the daily model throw, and `ignoreList` missing makes the restraint gate throw. Copy
`config-example.json`, which carries every field. The one place a missing field is tolerated
is an account section, where blank means "not this network" rather than a mistake.

A missing or malformed file is a warning, not a failure — `loadConfig` yields `{}` and the
page loads unconfigured and says so, rather than failing to start.

The Configure panel is a note explaining where `config.json` lives and that it is gitignored;
it has no fields and writes nothing. A configuration change means editing the file and
reloading the page.

### 4.20 The LLM client response **[D]**

*Serves:* G-1.

```
generateResponse(request):
  r = await fetch(config.baseUrl, { model, messages, temperature, max_tokens,
                                    reasoning: { enabled: false } })
  if not r.ok -> throw "OpenRouter API error: <status> <body>"
  choice = r.json().choices[0]
  if choice.message.content is not a non-blank string
    -> throw "OpenRouter returned no content for model <model>
              (finish_reason: <choice.finish_reason>)"
  -> { content, model, usage }
```

Every request turns reasoning off. The prompt asks the model for its own `# Thinking`,
`# Related Western`, `# Related Eastern` and `# Insight 1` … `3` sections and only
`# Response` is ever posted, so
private reasoning is budget spent on text nothing reads — and on a reasoning model it is spent
first, so the whole of `LLM_MAX_TOKENS` can go to thinking and leave `content` null. It is off
for every model, including those that do not reason; a model that refuses the flag is a problem
to meet when one appears.

A 200 carrying no usable content — an empty `choices` array, a null `content`, a model that
spent its budget before emitting any — is a failure, not an empty reply. Throwing lands the
chain in `dead` with the model and the `finish_reason` named, where returning `''` would travel
all the way to a blank post.

### 4.21 Authentication refresh — `ensureAuth` **[D]**

*Serves:* G-4. Called before every Bluesky operation, on each account's own client.

```
ensureAuth():
  await ensureLexicon()                           # once per client, before the login
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

The lexicon is registered before the login rather than before the first read, because the
SDK refuses an unknown NSID before any request is made — including the ones that follow a
successful login.

The login goes to the account's own `service`, never to a central entryway: ATProto
authenticates at the PDS that holds the repository, so the credential is checked against
that PDS's own record of the account and nowhere else (R-38). An account password is whatever
was set there, and two accounts may share one; an app password is a record its issuing PDS
created, so it is good at that PDS alone. `bsky.social` is `https://bsky.social`'s entryway and knows
only the accounts it hosts; `oblique.delve.town` lives on `https://pds.delve.town` and is
reached there. Each account keeps its own session and its own expiry.

### 4.22 Speaking a network's lexicon **[D]**

*Serves:* G-1, G-4. Runs once per account, before its first call.

```
nsid(suffix)          -> '<account.lexicon>.<suffix>'      # every method and record type

registerLexicon(agent, prefix, resolverService):
  if prefix is bundled with the SDK -> 0                   # app.bsky; nothing to fetch
  authority = segments of prefix, reversed   # 'town.delve' -> 'delve.town'
  did       = resolveHandle(authority) at resolverService
  pds       = '#atproto_pds' endpoint of that did's document
  documents = every com.atproto.lexicon.schema record in pds/did, following the cursor
  for each: strip the record's own $type, then baseClient.addLexicon(what is left)
  -> count

ensureLexicon(): register once, then remember; ensureAuth calls it before anything else
```

`@atproto/api` validates every call against a registry of lexicons it ships with and refuses
an NSID it has never heard of **before the request leaves the page**, so a network with its
own lexicon has to be taught first. The authority is not configured: the NSID *is* the
authority's domain reversed, so `town.delve` is published by `delve.town`, and a further
network is one prefix and nothing else (R-40).

A record's `$type` is `com.atproto.lexicon.schema` — the kind of record it is, not the kind
of thing the lexicon describes — so it is dropped before registering and the registry is
handed the document itself.

Reads are addressed with the `atproto-proxy` header, set on the agent from the account's
`appview`. This is the protocol's own mechanism: the PDS resolves the named DID, mints a
service-auth token and forwards. The reference PDS also forwards `app.bsky.*` to Bluesky's
AppView with no header at all, which is why Bluesky worked before any of this existed — but
that is a convenience Bluesky has said it may withdraw, and no other PDS owes it. Naming the
AppView is the correct behaviour in both cases.

`agent.post`, `agent.getPostThread` and `agent.updateSeenNotifications` are hard-wired to
`app.bsky.*`, so each goes through `api.xrpc.call` with a built NSID instead. A post is
written as a plain `com.atproto.repo.createRecord` into the account's own `feed.post`
collection. Every thread read goes through one private `getPostThread`, so the NSID is built
in one place rather than at seven call sites.

### 4.23 Not yet built **[D, unbuilt]**

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
  interval = #poll-interval value, or POLL_DEFAULT_S when absent or outside
             POLL_MIN_S…POLL_MAX_S   # the input itself is clamped on change and blur (U-7)
  schedule():
    setTimeout(interval):
      if still polling: await checkNotifications(); schedule()

checkNotifications():
  if no account or no llmClient -> show the reason, stop
  for each account:                                     # in ACCOUNT_SECTIONS order
    checks += await checkAccount(account, llmClient, onWaitingTaskComplete, #mark-as-seen)
  for each check, for each task in check.tasks:
    state = addTask(state, task)                        # the one queue, whatever account
  render one section per check: its handle, a box per answered notification,
    the tally of the reasons it declined, or its error

checkAccount(account, llmClient, onWaitingTaskComplete, markAsSeen) -> AccountCheck:
  try:
    await account.client.ensureAuth()
    notifs = await account.client.getNotifications(NOTIFICATION_BATCH, unreadOnly = true)
    if none -> { answered: [], declined: [], tasks: [], error: null }
    if markAsSeen -> await account.client.markNotificationsAsSeen()   # once, for the batch
    -> { …judgeNotifications(account, notifs, …), error: null }
  catch e:
    -> { answered: [], declined: [], tasks: [], error: reason(e) }    # this account only

judgeNotifications(account, notifs, llmClient, onWaitingTaskComplete):
  for each notif:
    postData = needsPostData(notif)                       # no fetch for a like or a mention
      ? await fetchPostData(account.client, notif)        # null on failure, never a throw
      : null
    reason = notificationRestraintReason(notif, postData, account.handle)
    if reason: log '@<author>: <reason>'; declined += reason; continue
    answered += notif
    tasks    += createReplyTask(notif, llmClient, account.client, onWaitingTaskComplete)
  -> { answered, declined, tasks }

tallyReasons(declined) -> one { reason, count } per distinct reason, commonest first
```

Every account is visited on every pass, in turn, and they all feed the one queue — a reply to
delve.town and a reply to Bluesky are the same kind of task and wait in the same line (D-22).
`checkAccount` queues nothing itself; it answers with the tasks it earned and the caller
threads the orchestrator state, so a network that is down, or an app password the wrong PDS
refuses, is reported in that account's own section of the panel and costs that account alone
(R-39).

`NOTIFICATION_BATCH` is a window on the most recent notifications, not a page of a queue:
there is no cursor and nothing is remembered, so a notification that falls past the window is
never asked for again. It can only sink further, never rise. The window must therefore be
wider than any burst the poll interval can accumulate, and wide enough that the reasons
Rule 0 refuses — likes, reposts, follows — cannot crowd out a mention beneath them (D-11).

The panel shows a box for each notification being answered and, beneath them, the reasons the
rest were passed over with a count against each. A declined notification gets no box: the
tally says how many and why, and the console carries the author and the disposition one at a
time, which is where a single notification's fate is looked up (D-25).

The poller's information is exactly what the Bluesky API returns for unread notifications —
it has no memory of what it saw last pass. Marking as seen happens before the per-notification
loop so a mid-loop failure cannot cause the same batch to be reprocessed forever.

Each notification is considered on its own. `fetchPostData` answers `null` for anything
Bluesky refuses — a deleted post, a blocked author, a URI it will not resolve — so one bad
notification costs that notification and not the batch. `null` travels on to the restraint
gate rather than skipping it, because the gate already treats unreadable post data as a
deleted post, and a mention is still answered unconditionally.

`onWaitingTaskComplete` is the bridge back into the orchestrator: the LLM promise calls it with
`(taskId, successor)`, and it invokes rule 4.7 and refreshes the status display.

---

## §6 Numbers **[T]**

Every one of these is tunable. **Refer to a constant by name everywhere else** — code, docs and
tests. The code is the single source; the value here is a copy.

| Name | Value | Unit | Where | Decision |
|---|---|---|---|---|
| `MAX_BLUESKY_REPLY_CHARS` | 300 | characters | `reply-length.ts` | D-9, D-19 |
| `ADVERTISED_REPLY_CHARS` | 290 | characters | `reply-length.ts` | D-19 |
| `LLM_MAX_ATTEMPTS` | 5 | attempts | `generateLLMResponseWithRetry` | D-9 |
| `LLM_TEMPERATURE` | 0.8 | — | both LLM paths | D-10 |
| `LLM_MAX_TOKENS` | 8000 | tokens | both LLM paths | D-10 |
| `OPENROUTER_FALLBACK_TEMPERATURE` | 0.7 | — | `openrouter.ts` | D-10 |
| `OPENROUTER_FALLBACK_MAX_TOKENS` | 500 | tokens | `openrouter.ts` | D-10 |
| `THREAD_MAX_POSTS` | 60 | posts | `threadRestraintReason` | D-7 |
| `BOT_WINDOW` | 8 | posts | `botAttenuationReason` | D-7 |
| `BOT_ATTENUATION_LIMIT` | 4 | posts | `botAttenuationReason` | D-7 |
| `THREAD_MAX_DEPTH` | 25 | ancestors | `getHistory` | D-8 |
| `NOTIFICATION_BATCH` | 50 | notifications | `checkAccount` | D-11 |
| `POLL_DEFAULT_S` | 120 | seconds | `getPollIntervalSeconds`, and again as the `#poll-interval` value in `index.html` | D-11 |
| `POLL_MIN_S` | 10 | seconds | `getPollIntervalSeconds` | D-11 |
| `POLL_MAX_S` | 3600 | seconds | `getPollIntervalSeconds` | D-11 |
| `TASK_ID_LENGTH` | 24 | characters | `generateTaskId` | D-3 |
| `SAFE_BASE32_ALPHABET` | `abcdefghijkmnpqrstuvwxyz23456789` | — | `safebase32.ts` | D-3 |
| `TOKEN_REFRESH_BUFFER_MS` | 300000 | ms (5 min) | `BlueskyClient` | D-12 |
| `TOKEN_DEFAULT_TTL` | 86400000 | ms (1 day) | `getDefaultTokenExpiration` | D-12 |
| `RECORD_PAGE` | 100 | records per request | `fetchSchemas` | D-23 |
| `MODEL_ROTATION_SIZE` | 23 | models | `config.json` → `openrouter.models` | D-5 |
| `GENDER_ROTATION_SIZE` | 25 | entries | `prompts/oblique.ts` | D-5 |

Only `MAX_BLUESKY_REPLY_CHARS`, `ADVERTISED_REPLY_CHARS`, `TOKEN_REFRESH_BUFFER_MS`,
`RECORD_PAGE` and `SAFE_BASE32_ALPHABET` are named constants in the code today; the rest are literals at their use site, except
`MODEL_ROTATION_SIZE`, which is the length of a list in `config.json`. Naming them is Q-7 in
`ARCHITECTURE_LOG.md`.

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
| `processNextTask(state)` | always | Runs the head of the queue (4.4). Returns a promise; nothing inside it awaits. | whatever `process` does |
| `processAllTasks(state)` | always | Drains the queue (4.5). Returns a promise. | as above |
| `startLoop(state, onStateChange?)` | `!state.isRunning` | Starts the rAF loop; returns `{ state, stop }`. | schedules frames |
| `resumeWaitingTask(state, taskId, successor)` | `taskId` is in TaskMap and in the WaitingSet | Resumes a chain (4.7). Otherwise warns and leaves the state unchanged. | none |
| `errorWaitingTask(state, taskId, successor)` | as resume | Identical to resume (4.7). | none |

Every command returns the state object, the two drain commands wrapped in a promise.
**The state is mutated in place** — the returned reference is the same object, not a copy.
Callers reassign by convention, not because they must. This is the one place the system is
not functional, and it is why there is exactly one orchestrator per page.

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
| `window.oblique.getState()` | `{ orchestrator, hasLLM, blueskyAccounts }` — the configured handles, for console debugging. Throws today: it calls `require` in an ES module (`getstate-viig`). |

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
