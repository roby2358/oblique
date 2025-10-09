# Oblique

A bot that answers only obliquely using LLM APIs. Built in TypeScript as an agent combining a queue, pending map, and user action stacks.

**Core Components:**
- LLM hooks (OpenRouter, OpenAI, Anthropic)
- Bluesky integration
- Task queue for sequential processing
- Pending map for async operations
- User action stacks for conversation context

**Status:** Browser-based web interface with CLI option. In-memory storage with hooks for persistence.

## Getting Started

### Installation

```cmd
npm install
```

### Browser Interface (Default)

The browser interface provides a modern web UI for interacting with Oblique.

**Development mode:**
```cmd
npm run dev
```

This will start a Vite dev server (usually at http://localhost:3000) and open your browser.

**Configuration:**

Option 1 - Use `config.json` (recommended):
1. Copy `config-example.json` to `config.json`
2. Add your OpenRouter API key to `config.json`
3. Optionally change the model (default: `anthropic/claude-3.5-haiku`)
4. The app will load this config on startup

Option 2 - Use the UI:
- Click the "⚙️ Configure" button in the UI
- Enter your OpenRouter API key (get one at https://openrouter.ai/keys)
- Optionally change the model
- Click "Save Configuration"
- Your API key is stored in browser localStorage

Priority: `config.json` → localStorage → defaults

**Production build:**
```cmd
npm run build
npm start
```

### CLI Interface (Optional)

For command-line usage, use the CLI scripts:

**Development mode:**
```cmd
npm run dev:cli
```

**Configuration:**
1. Copy `.env.example` to `.env` (create manually if needed)
2. Add your API keys:
   - For OpenRouter: Set `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL`
   - For Bluesky: Set `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD`

**Build and run:**
```cmd
npm run build:cli
npm run start:cli
```

### Testing

Run all tests:
```cmd
npm test
```

Run tests in watch mode:
```cmd
npm run test:watch
```

### Usage

**Browser Interface:**
1. Open the app in your browser
2. Configure your API key if not already set
3. Type messages in the input box
4. Receive oblique responses
5. View agent status at the bottom

**CLI Interface:**
- Type messages to receive oblique responses
- Type `/status` to see agent statistics
- Type `/quit` to exit

Example CLI session:
```
You: What is the meaning of life?
Oblique: A river remembers the mountains it once climbed.

You: /status
Status: Queue=0, Pending=0, Users=1
```

### Key Design Principles
- **Functional approach**: Favor pure functions and immutable data structures where possible
- **Modular hooks**: LLM and Bluesky integrations are pluggable and replaceable
- **Type safety**: Full TypeScript types throughout
- **Testability**: Unit tests for all core functionality
- **Extensibility**: Storage layer can be swapped from memory to persistent storage
