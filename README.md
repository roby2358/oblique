# Oblique

A bot that answers only obliquely using LLM APIs. Built in TypeScript as an agent combining a queue, pending map, and user action stacks.

**Core Components:**
- LLM hooks (OpenRouter)
- Bluesky integration (future)
- Task queue for sequential processing
- Pending map for async operations
- User action stacks for conversation context

**Status:** Browser-based web interface. In-memory storage with hooks for persistence.

## Getting Started

### Installation

```cmd
npm install
```

### Development Mode

Start the Vite dev server:
```cmd
npm run dev
```

This will start a development server (usually at http://localhost:5173).

### Configuration

**Option 1 - Use `config.json` (recommended):**
1. Copy `config-example.json` to `config.json`
2. Add your OpenRouter API key to `config.json`
3. Optionally change the model (default: `anthropic/claude-3.5-haiku`)
4. The app will load this config on startup

**Option 2 - Use the UI:**
- Click the "⚙️ Configure" button in the UI
- Enter your OpenRouter API key (get one at https://openrouter.ai/keys)
- Optionally change the model
- Click "Save Configuration"
- Your API key is stored in browser localStorage

Priority: `config.json` → localStorage → defaults

### Production Build

```cmd
npm run build
npm start
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

1. Open the app in your browser
2. Configure your OpenRouter API key if not already set
3. Type messages in the input box
4. Receive oblique responses
5. View agent status at the bottom of the page

### Key Design Principles
- **Functional approach**: Favor pure functions and immutable data structures where possible
- **Modular hooks**: LLM and Bluesky integrations are pluggable and replaceable
- **Type safety**: Full TypeScript types throughout
- **Testability**: Unit tests for all core functionality
- **Extensibility**: Storage layer can be swapped from memory to persistent storage
