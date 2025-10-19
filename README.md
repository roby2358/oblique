# Oblique

A bot that answers only obliquely using LLM APIs. Built in TypeScript as a conversation-based task processing engine with a queue and pending map architecture.

## Architecture

Oblique now includes **two task orchestration systems**:

### 1. Original Agent Architecture

Oblique operates as a task processing engine with two core data structures:

1. **Queue**: A FIFO queue containing all tasks waiting to be processed
2. **Pending Map**: Tracks tasks currently waiting for asynchronous operations to complete

Each user message creates a unique conversation that flows through the system as a series of tasks:

```
User Message → Queue → Process → Pending Map → Queue → Complete
```

**Core Components:**
- **Task Queue** - Sequential FIFO processing of conversations
- **Pending Map** - Async operation tracking with timeout support
- **LLM Hooks** - OpenRouter integration (pluggable for other providers)
- **Storage Layer** - In-memory storage with interface for persistence
- **Bluesky Hook** - Social network integration (future)

**Status:** Browser-based web interface with full test coverage. Production-ready.

### 2. DRAKIDION Task Orchestration

**DRAKIDION** is a single-worker, browser-resident task orchestration system that executes asynchronous and deferred tasks entirely within a web page context. It uses immutable task snapshots and a finite state machine model.

**Key Features:**
- **Immutable Task Snapshots** - Each task is a snapshot with factory function pattern
- **TaskMap** - Mutable map holding latest snapshot per taskId
- **TaskQueue** - FIFO queue of taskIds with status='ready'
- **WaitingMap** - Correlation tracking for async operations
- **Orchestrator** - Single worker loop for sequential processing
- **Safe-base32 IDs** - 24-character collision-resistant identifiers

**Status:** Fully implemented with comprehensive test coverage. See `DRAKIDION.md` and `DRAKIDION_IMPLEMENTATION.md` for details.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or compatible package manager
- OpenRouter API key (get one at https://openrouter.ai/keys)

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

You MUST provide an OpenRouter API key to use Oblique. There are two configuration methods:

**Option 1 - Use `config.json` (RECOMMENDED):**
1. Copy `config-example.json` to `config.json`
2. Add your OpenRouter API key to `config.json`
3. Optionally set the model (default: `anthropic/claude-3.5-haiku`)
4. The app will load this config on startup

**Option 2 - Use the UI:**
- Click the "⚙️ Configure" button in the UI
- Enter your OpenRouter API key (get one at https://openrouter.ai/keys)
- Optionally change the model
- Click "Save Configuration"
- Configuration is updated in memory and takes effect immediately

**Configuration:** All settings are managed via `config.json` file and runtime updates

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

## How It Works

### Task Flow

When you send a message, Oblique creates a conversation with a unique ID and processes it through three task types:

1. **`process_message`** - Creates an oblique prompt from your message
2. **`send_llm_request`** - Sends the prompt to the LLM API (moves to Pending Map during async call)
3. **`return_response`** - Delivers the oblique response back to you

```
User: "What's the weather?"
  ↓
[Queue] process_message → Creates oblique prompt
  ↓
[Queue + Pending Map] send_llm_request → Calls LLM API
  ↓ (async operation completes)
[Queue] return_response → Delivers: "A sailor once told me the sky speaks in grays."
```

### Oblique Response Rules

The LLM is instructed to:
- Never answer directly
- Use metaphor, analogy, and allusion
- Keep responses brief (1-3 sentences)
- Maintain thematic connection to the input
- Avoid nonsense while preserving meaning

### Key Design Principles
- **Functional approach**: Favor pure functions and immutable data structures
- **Modular hooks**: LLM and Bluesky integrations are pluggable and replaceable
- **Type safety**: Full TypeScript types throughout
- **Testability**: Unit tests for all core functionality
- **Extensibility**: Storage layer can be swapped from memory to persistent storage

## Project Structure

```
src/
├── drakidion/      # Core task processing engines
│   ├── agent.ts            # Original Agent orchestrator
│   ├── queue.ts            # FIFO queue implementation
│   ├── pending-map.ts      # Async operation tracker
│   ├── drakidion.ts        # DRAKIDION main export
│   ├── drakidion-types.ts  # DRAKIDION type definitions
│   ├── task-map.ts         # DRAKIDION TaskMap
│   ├── task-queue.ts       # DRAKIDION TaskQueue  
│   ├── waiting-map.ts      # DRAKIDION WaitingMap
│   ├── orchestrator.ts     # DRAKIDION Orchestrator
│   └── task-factories.ts   # DRAKIDION task factories
├── hooks/          # External integrations
│   ├── llm/            # LLM clients (OpenRouter)
│   └── bluesky/        # Bluesky social integration
├── storage/        # Persistence layer
│   ├── storage-interface.ts  # Abstract storage interface
│   └── memory-storage.ts     # In-memory implementation
├── prompts/        # Prompt engineering
│   └── oblique.ts      # Oblique response prompts
├── types/          # TypeScript type definitions
├── utils/          # Utility functions (including safe-base32 IDs)
└── examples/       # Usage examples
    └── drakidion-demo.ts   # DRAKIDION demo code

test/               # Unit tests (Jest)
├── drakidion/          # Core component tests (100% coverage)
│   ├── agent.test.ts
│   ├── queue.test.ts
│   ├── pending-map.test.ts
│   ├── task-map.test.ts        # DRAKIDION
│   ├── task-queue.test.ts      # DRAKIDION
│   ├── waiting-map.test.ts     # DRAKIDION
│   ├── orchestrator.test.ts    # DRAKIDION
│   └── task-factories.test.ts  # DRAKIDION
├── storage/            # Storage tests
├── prompts/            # Prompt tests
└── utils/              # Utility tests (including ID generation)
```

## API Usage

### Basic Usage

```typescript
import { createAgent, processMessageAndWait } from './drakidion/agent.js';
import { createMemoryStorage } from './storage/memory-storage.js';
import { createOpenRouterClient } from './hooks/llm/index.js';

// Initialize the agent
const agent = await createAgent({
  storage: createMemoryStorage(),
  llmClient: createOpenRouterClient({
    apiKey: 'your-api-key',
    model: 'anthropic/claude-3.5-haiku'
  }),
  autoSave: true
});

// Send a message and get response
const [response, newAgent] = await processMessageAndWait(
  agent,
  'user-123',
  'What is truth?'
);

console.log(response); // "A mirror shows what you bring to it."
```

### Advanced Usage with Manual Task Processing

```typescript
import { processMessage, processNextTask } from './drakidion/agent.js';

// Create conversation
const [conversationId, agentWithTask] = processMessage(
  agent,
  'user-123',
  'Hello',
  (result) => {
    console.log('Conversation complete:', result);
  }
);

// Process tasks manually
let currentAgent = agentWithTask;
currentAgent = await processNextTask(currentAgent);  // process_message
currentAgent = await processNextTask(currentAgent);  // send_llm_request
currentAgent = await processNextTask(currentAgent);  // return_response
```

### Check Agent Status

```typescript
import { getAgentStatus } from './drakidion/agent.js';

const status = getAgentStatus(agent);
console.log(`Queue: ${status.queueSize}, Pending: ${status.pendingTasks}`);
```

## Testing

Oblique has comprehensive unit test coverage for all core components.

### Test Coverage

- **Core Components** (`test/drakidion/`)
  - `queue.test.ts` - 15 tests (FIFO operations, immutability)
  - `pending-map.test.ts` - 13 tests (async tracking, timeouts)
  - `agent.test.ts` - 8 tests (task processing, conversation flow)

- **Storage** (`test/storage/`)
  - `memory-storage.test.ts` - 6 tests (save/load/clear operations)

- **Utilities & Prompts** (`test/utils/`, `test/prompts/`)
  - `index.test.ts` - 6 tests (UUID generation, helpers)
  - `oblique.test.ts` - 3 tests (prompt generation)

### Test Philosophy

Tests MUST verify:
- **Immutability** - Operations don't mutate original data
- **Pure Functions** - Deterministic input → output mapping
- **Edge Cases** - Empty collections, nonexistent items, errors
- **Integration** - Component interactions work correctly

### Running Tests

```cmd
# Run all tests
npm test

# Watch mode for development
npm run test:watch
```

## Future Enhancements

### Planned Features

1. **Persistent Storage** - Database integration for conversations and tasks
2. **Bluesky Integration** - Monitor mentions, auto-reply with conversation tracking
3. **Task Scheduling** - Cron-like task execution
4. **Multiple LLM Strategies** - A/B test different models per conversation
5. **Rate Limiting** - API quota management
6. **Response Caching** - Reduce API calls for similar conversations
7. **Metrics & Analytics** - Track conversation patterns, task completion rates
8. **CLI Interface** - Command-line interaction option
9. **Conversation History** - Track and display conversation threads
10. **Multi-turn Context** - Maintain context across conversation turns

### Extensibility Points

- **New LLM Providers** - Implement `LLMClient` interface
- **Alternative Storage** - Implement `Storage` interface (SQLite, PostgreSQL, Redis)
- **Custom Task Types** - Extend queue processor with new task types
- **Plugin System** - Add hooks for custom processing logic
- **Conversation Middleware** - Custom processing pipeline stages

## Technical Details

### Type System

Core types are defined in `src/types/index.ts`:

- `Task` - Work items in the queue with conversationId, type, payload
- `PendingTask` - Tasks waiting for async operations
- `Conversation` - Conversation state tracking (queued, processing, completed)
- `TaskId`, `UserId`, `ConversationId` - String identifiers

Conversation IDs MUST be unique random strings (UUID v4).

### Functional Programming

Oblique emphasizes functional programming principles:

- All data structures are immutable
- Functions are pure (no side effects in core logic)
- Composition over inheritance
- Higher-order functions for operations
- Dependency injection for external services

### Documentation

- `README.md` - This file (getting started, API usage)
- `SPEC.md` - Detailed specification and architecture
- `IMPLEMENTATION_SUMMARY.md` - Task-based architecture implementation notes
- `DRAKIDION.md` - DRAKIDION specification
- `DRAKIDION_IMPLEMENTATION.md` - DRAKIDION implementation guide with examples

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`npm test`)
- New features include unit tests
- Code follows TypeScript best practices
- Documentation is updated

For detailed architecture information, see `SPEC.md`.
