# Oblique

A bot that answers only obliquely. It watches Bluesky notifications, reads the thread behind
each one, and replies through one of four lenses — supertext, subtext, architext, psychotext —
or decides not to reply at all. It runs entirely as a single web page: no server, no database,
no background process.

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
- A Bluesky handle and app password, to reply to notifications

### Install

```
npm install
```

Install on the platform you build from. Vite's `rollup` and `esbuild` ship per-platform
binaries, so a `node_modules/` installed from Windows and reused from WSL (or the reverse)
fails at `vite build` with `Cannot find module '@rollup/rollup-linux-x64-gnu'`.

### Configure

Copy `config-example.json` to `config.json` and fill it in:

```json
{
  "openrouter": {
    "apiKey": "sk-or-v1-...",
    "models": ["anthropic/claude-sonnet-4.5", "openai/gpt-5"],
    "rotate": true,
    "baseUrl": "https://openrouter.ai/api/v1/chat/completions"
  },
  "bluesky": {
    "handle": "your-handle.bsky.social",
    "password": "your-app-password"
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

`models` is the list the bot speaks through; the template ships 15. `rotate` true walks the
list one entry per UTC day, so the bot has one character a day and a different one tomorrow;
false always uses the first entry, which makes pinning a model a matter of putting it first.

`ignoreList` holds handles never replied to. `botList` holds handles treated as bots, which
the attenuation rule uses to stop bot-to-bot loops.

### Run

```
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc + vite build
npm start        # preview the production build
npm test         # Jest
```

### Use

The page has five panels:

- **Chat** — type a message and get an oblique reply. No restraint rules apply; this is the
  manual test path.
- **Bluesky** — check notifications once, or start polling on an interval. Each notification
  that passes the restraint rules becomes a task.
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
│   └── bluesky/             # BlueskyClient: auth, notifications, history, post, like
├── prompts/oblique.ts   # system prompt, the four lenses, daily model and voice rotation
├── oblique-task-factory.ts  # the reply chain and the chat chain
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
