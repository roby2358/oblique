# Oblique

A bot that answers only obliquely using LLM APIs. Built in TypeScript as an agent combining a queue, pending map, and user action stacks.

**Core Components:**
- LLM hooks (OpenAI, Anthropic)
- Bluesky integration
- Task queue for sequential processing
- Pending map for async operations
- User action stacks for conversation context

**Status:** In-memory storage with hooks for persistence. CLI interface with web deployment planned.

## Getting Started

### Installation

```cmd
npm install
```

### Configuration

1. Copy `.env.example` to `.env` (create manually if needed)
2. Add your API keys:
   - For Anthropic: Set `ANTHROPIC_API_KEY`
   - For OpenAI: Set `OPENAI_API_KEY`
   - For Bluesky: Set `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD`

### Running

Development mode (with hot reload):
```cmd
npm run dev
```

Build and run:
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

Once running, you can interact with Oblique through the CLI:

- Type messages to receive oblique responses
- Type `/status` to see agent statistics
- Type `/quit` to exit

Example:
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
