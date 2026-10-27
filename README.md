# Oblique

A bot that answers only obliquely. It watches Bluesky notifications, reads the thread behind
each one, and decides *how* to answer before it writes a word: one of four lenses —
supertext, subtext, architext, psychotext — or a one-stanza poem, or a clean one-liner, or
silence, which is a like and nothing else. That choice is put to **Jev**, a System One model
that answers typed questions with a distribution, and the register is drawn from the
distribution rather than taken off the top of it, so a reply answers the post in front of it
without the bot settling into one voice.

Every twenty to forty minutes it also goes looking. It reads its own timeline, throws out
everything it should not touch, asks Jev which of what is left would most repay a lateral reply
— with "none of them" among the options, and usually the right one — and answers that post as
though it had been a mention. It runs entirely as a single web page: no server, no database, no
background process.

## Documentation

| Document | What it answers |
|---|---|
| [`ONTOLOGY.md`](ONTOLOGY.md) | What exists and how it behaves. The implementation reference. |
| [`CRITERIA.md`](CRITERIA.md) | How we know it is correct, and where the gaps are. |
| [`ARCHITECTURE_LOG.md`](ARCHITECTURE_LOG.md) | Why each choice was made, what is unsettled, and what changed when. |

`ONTOLOGY.md` and `CRITERIA.md` describe the current state only. Anything historical or
speculative belongs in `ARCHITECTURE_LOG.md`.

## Getting started

### Prerequisites

- Node.js 18 or later
- An [OpenRouter API key](https://openrouter.ai/keys)
- A Bluesky handle and password, to reply to notifications. One account per network it
  answers on, each with a credential that network will accept

### Install

```
npm install
```

Install on the platform you run from. Vite's `esbuild` and `rollup` ship per-platform
binaries, so a `node_modules/` installed from Windows and reused from WSL (or the reverse)
fails with `Cannot find module '@esbuild/linux-x64'` or its rollup equivalent.

### Configure

Copy `config-example.json` to `config.json` and fill it in:

```json
{
  "openrouter": {
    "apiKey": "sk-or-v1-...",
    "models": ["~anthropic/claude-sonnet-latest", "~openai/gpt-sol-latest"],
    "rotate": false,
    "baseUrl": "https://openrouter.ai/api/v1/chat/completions"
  },
  "jev": {
    "model": "~typesafe/jev-latest",
    "baseUrl": "https://openrouter.ai/api/alpha/decisions"
  },
  "bluesky": {
    "handle": "your-handle.bsky.social",
    "password": "your-app-password",
    "service": "https://bsky.social",
    "appview": "did:web:api.bsky.app#bsky_appview",
    "lexicon": "app.bsky"
  },
  "delvetown": {
    "handle": "your-handle.delve.town",
    "password": "your-app-password",
    "service": "https://pds.delve.town",
    "appview": "did:web:api.delve.town#bsky_appview",
    "lexicon": "town.delve"
  },
  "ignoreList": [],
  "botList": []
}
```

The file is the whole configuration — there are no defaults in code, so copy
`config-example.json` and keep every field. A field left out is absent at runtime rather than
defaulted. A missing or malformed file is a warning, not a failure: the page loads
unconfigured and says so.

`config.json` is gitignored, so the API key and app password stay out of the repository. It
is the only source of configuration — the **Configure** panel is a note pointing at it, with
nothing to type in. Changing configuration means editing the file and reloading the page.

`models` is the list the bot speaks through; the template ships 23, preferring OpenRouter's
floating `~vendor/model-latest` aliases over dated slugs so a vendor's releases arrive without
an edit. `rotate` false — the shipped default — always uses the first entry, so pinning a
model means putting it first. Set it true to walk the list one entry per UTC day, giving the
bot one character a day and a different one tomorrow.

`jev` is the model that picks the register for each reply, and the post to answer when Oblique
reads its feed. It is reached on the same
OpenRouter key at a different endpoint, because it speaks a different protocol — state and
typed questions in, a typed answer and a distribution out, no messages and no completion. It
is the cheapest call in a reply by an order of magnitude. Leave the block out and every reply
draws one of the four lenses uniformly instead, which is what the bot did before Jev, and says
so in the chain's work.

`bluesky` and `delvetown` are **account sections**: Oblique signs in to every one that is
filled in and polls them all into the same task queue, so one page answers on both networks
and a reply goes back to the network it came from. Leave a section blank to run on one
network only. A network is three things, and they vary independently:

- **`service`** — the PDS that holds the account's repository, where it signs in and writes.
  ATProto authenticates at that PDS, not at a central entryway, so the credential is checked
  against its own record of the account. An account password is whatever you set there, and
  two accounts may happily share one; an *app password* is a record its issuing PDS created
  and no other PDS knows about, so each account needs its own.
- **`appview`** — who answers reads about it, as an `atproto-proxy` header value. The PDS
  forwards the call there with a service-auth token. Bluesky's PDS forwards `app.bsky.*` to
  Bluesky's AppView even without the header, but that is a convenience on its way out and no
  other PDS offers it.
- **`lexicon`** — what the records are called. **delve.town is not a Bluesky PDS with another
  hostname**: it is a separate network whose lexicon is a fork of `app.bsky.*` published as
  `town.delve.*`. The two share only a DID, and a post in one is invisible in the other.

Adding a third network means a section here with those three endpoints and one entry in
`ACCOUNT_SECTIONS` in `src/bluesky-accounts.ts`. Nothing else: a lexicon the SDK does not
ship is fetched from the authority its own NSID names (`town.delve` → `delve.town`).

After changing any of the three, run `just cc-smoke` — a live, read-only check that each
account can sign in, list its notifications and read a thread. The unit suite never signs in,
so it cannot tell you this.

`ignoreList` holds handles never replied to. `botList` holds handles treated as bots, which
the attenuation rule uses to stop bot-to-bot loops. Both apply to every account.

### Run

```
npm run dev      # Vite dev server on http://localhost:5173
npm test         # Jest
just cc-smoke    # live read-only check that every configured account is reachable
npx tsc --noEmit # type-check
```

Or through the justfile: `just up`, `just test`, `just typecheck`, `just check`.

There is no build step. Vite serves the page from source and nothing deploys a bundle yet, so
`tsc` is configured `noEmit` and exists only to type-check. Add a build back when there is
somewhere to deploy it to.

### Use

The page has five panels:

- **Chat** — type a message and get an oblique reply. No restraint rules apply; this is the
  manual test path. It reports the register it drew and how, which makes it the way to see
  what Jev makes of a line — including a line it would rather answer with silence.
- **Bluesky** — check notifications once, or start polling on an interval, across every
  configured account. Each notification that passes the restraint rules becomes a task and is
  shown; the rest are summed up by reason underneath, and the console carries the author and
  the disposition of each one. **Check Feed** does the other thing: it reads the timeline and
  answers at most one post from it. While polling, that happens on its own every twenty to
  forty minutes per account, after the notifications of that pass — so one switch arms the
  whole bot, and the button is only there to see a look without waiting for one.
- **Observer**, **Queue**, **Waiting** — the live task state. Every task shows its `taskId`,
  version, status and description; a chain can be followed end to end by its `taskId`.
- **Configure** — where `config.json` lives and what it holds. Read-only.

The status line shows queue and waiting counts. `window.oblique` exposes `getState()`,
`processNext()` and `processAll()` for console debugging.

## Layout

```
src/
├── drakidion/           # Task orchestration core. No DOM, no network.
│   ├── drakidion.ts         # public surface
│   ├── drakidion-types.ts   # DrakidionTask, TaskMap, TaskQueue, WaitingSet, OrchestratorState
│   ├── orchestrator.ts      # the worker loop and state transitions
│   ├── task-map.ts          # latest snapshot per chain
│   ├── task-queue.ts        # FIFO of ready chains
│   ├── waiting-set.ts       # chains awaiting a callback
│   ├── task-factories.ts    # newReadyTask / newWaitingTask / nextTask
│   └── functions.ts         # wrap a plain function as a task
├── hooks/
│   ├── llm/                 # LLMClient interface, OpenRouter implementation
│   ├── jev/                 # JevClient interface, OpenRouter decisions implementation
│   └── bluesky/             # BlueskyClient: auth, notifications, history, post, like
│                             # lexicon.ts: teaching the SDK a network's own lexicon
├── registers/           # a class per register: the four lenses, poem, oneliner, silence
│                        # register.ts: the prompt assembly and the occasion it is applied to
│                        # index.ts: the menu Jev chooses from, and the draw
├── prompts/oblique.ts   # system prompt, thread formatting, daily model and voice rotation
├── register-choice.ts   # the third gate: which register to answer in
├── feed-choice.ts       # the fourth gate: which post in the feed to answer, or none
├── feed-schedule.ts     # when a feed look is due; one clock per account, drawn once per look
├── weighted-draw.ts     # drawing a label from Jev's distribution, shared by both gates
├── oblique-task-factory.ts  # the reply chain and the chat chain
├── bluesky-accounts.ts  # the config sections that name an account, and the clients built from them
├── bluesky-polling.ts   # the two restraint gates
├── config.ts            # config.json loading
├── types/index.ts       # shared wire types
├── utils/               # safe-base32 ids, deep merge
└── *Panel.ts, panels.ts, index.ts   # the jQuery UI

test/                    # Jest, organized by source file
```

## Contributing

- `npm test` must pass.
- A change to a rule or a number updates its rule in `ONTOLOGY.md`, its row in
  `CRITERIA.md`, and a dated entry in `ARCHITECTURE_LOG.md` — in the same change as the code.
- Cite stable IDs (`D-7`, `R-9`, `G-2`) in code comments, tests and commit messages, never
  section numbers.
- Refer to tunable numbers by name, never by value.

## License

MIT
