# Oblique Implementation Specification

## Overview

Oblique is an agent-based bot that responds to messages in an oblique, tangential manner using LLM APIs. The system is designed around three core data structures: a queue, a pending map, and user action stacks.

## Architecture

### Core Components

#### 1. Queue (`src/core/queue.ts`)
A functional FIFO queue for sequential task processing.

**Key Functions:**
- `createQueue()` - Create empty queue
- `enqueue(queue, task)` - Add task to end
- `dequeue(queue)` - Remove and return first task
- `peek(queue)` - View first task without removing
- `isEmpty(queue)` - Check if empty
- `size(queue)` - Get queue length

**Characteristics:**
- Immutable operations (returns new queue)
- Pure functional design
- Type-safe with TypeScript

#### 2. Pending Map (`src/core/pending-map.ts`)
Tracks asynchronous operations (like LLM API calls) that are in progress.

**Key Functions:**
- `createPendingMap()` - Create empty map
- `addPending(map, task)` - Add pending task
- `removePending(map, taskId)` - Remove completed task
- `getPending(map, taskId)` - Get task by ID
- `getExpiredPending(map)` - Find timed-out tasks

**Features:**
- Timeout tracking for hanging operations
- Task metadata storage
- Immutable Map-based implementation

#### 3. User Stack Map (`src/core/user-stack-map.ts`)
Maintains LIFO stacks of actions for each user to provide conversation context.

**Key Functions:**
- `createUserStackMap()` - Create empty map
- `pushAction(map, userId, action)` - Add user action
- `popAction(map, userId)` - Remove latest action
- `peekAction(map, userId)` - View latest action
- `getStack(map, userId)` - Get all user actions
- `clearStack(map, userId)` - Remove all user actions

**Use Cases:**
- Track conversation history
- Provide context to LLM
- Monitor user interaction patterns

### Agent Orchestrator (`src/core/agent.ts`)

The central coordinator that manages all components.

**Main Functions:**
- `createAgent(config)` - Initialize agent with storage and hooks
- `processMessage(agent, userId, message)` - Handle user messages
- `addTask(agent, task)` - Queue new task
- `processNextTask(agent)` - Execute queued task
- `getAgentStatus(agent)` - Get system metrics

**Agent State:**
```typescript
{
  queue: Queue,           // Task queue
  pendingMap: PendingMap, // Async operations
  userStackMap: UserStackMap, // User histories
  config: AgentConfig     // Configuration
}
```

### Storage Layer

#### Storage Interface (`src/storage/storage-interface.ts`)
Abstract interface for persistence.

```typescript
interface Storage {
  save(state: AgentState): Promise<void>;
  load(): Promise<AgentState | null>;
  clear(): Promise<void>;
}
```

#### Memory Storage (`src/storage/memory-storage.ts`)
In-memory implementation for development and testing.

**Future:** Can be extended with:
- File-based storage
- Database storage (SQLite, PostgreSQL)
- Cloud storage (S3, Redis)

### LLM Hooks (`src/hooks/llm/`)

Pluggable LLM client implementations.

#### Supported Providers:
- **OpenRouter** (`openrouter.ts`) - Unified access to multiple LLM providers

#### Interface (`llm-client.ts`):
```typescript
interface LLMClient {
  generateResponse(request: LLMRequest): Promise<LLMResponse>;
  isConfigured(): boolean;
}
```

**Features:**
- Automatic API error handling
- Token usage tracking
- Configurable temperature and max tokens
- Model selection per request

### Bluesky Hook (`src/hooks/bluesky/`)

Integration with Bluesky social network via `@atproto/api`.

**Key Functions:**
- `authenticate()` - Login with handle/password
- `post(post)` - Send post or reply
- `isConfigured()` - Check if credentials provided
- `isAuthenticated()` - Check authentication status

### Prompts (`src/prompts/oblique.ts`)

Prompt engineering for oblique responses.

**Functions:**
- `createObliquePrompt(message, context)` - Generate prompt with instructions
- `createSystemPrompt()` - System-level behavior definition

**Oblique Response Rules:**
- Never answer directly
- Use metaphor, analogy, allusion
- Keep responses brief (1-3 sentences)
- Maintain thematic connection
- Avoid nonsense, preserve meaning

## Data Flow

### Message Processing Flow

```
User Message
    ↓
1. Create UserAction
2. Push to user's stack
3. Get recent context (last 3 actions)
4. Generate oblique prompt
5. Call LLM API
6. Return response
7. Save state (if auto-save enabled)
```

### Task Processing Flow

```
Task Added
    ↓
1. Enqueue task
2. Dequeue when ready
3. Add to pending map
4. Process based on type:
   - send_llm_request → Call LLM
   - send_bluesky_post → Post to Bluesky
   - process_message → Handle message
5. Remove from pending map
6. Handle errors gracefully
```

## Configuration

### Configuration File (`config.json`)

```json
{
  "openRouterApiKey": "sk-or-v1-...",
  "openRouterModel": "anthropic/claude-3.5-haiku",
  "openRouterBaseUrl": "https://openrouter.ai/api/v1/chat/completions"
}
```

### Agent Configuration

```typescript
const agent = await createAgent({
  storage: createMemoryStorage(),
  llmClient: createOpenRouterClient({
    apiKey: config.openRouterApiKey,
    model: config.openRouterModel
  }),
  autoSave: true,
});
```

## Testing

### Test Coverage

- **Core Components**: 100% coverage
  - `queue.test.ts` - 15 tests
  - `pending-map.test.ts` - 13 tests
  - `user-stack-map.test.ts` - 14 tests
  
- **Storage**: Full coverage
  - `memory-storage.test.ts` - 6 tests
  
- **Agent**: Integration tests
  - `agent.test.ts` - 8 tests
  
- **Utils & Prompts**
  - `utils/index.test.ts` - 6 tests
  - `prompts/oblique.test.ts` - 5 tests

### Running Tests

```cmd
npm test                # Run all tests
npm run test:watch      # Watch mode
```

### Test Philosophy

- **Immutability**: Verify operations don't mutate original data
- **Pure Functions**: Test inputs → outputs deterministically
- **Edge Cases**: Empty collections, nonexistent items, errors
- **Integration**: Test component interactions

## Type System

### Core Types (`src/types/index.ts`)

```typescript
type TaskId = string;
type UserId = string;

interface Task {
  id: TaskId;
  type: 'process_message' | 'send_llm_request' | 'send_bluesky_post';
  payload: unknown;
  createdAt: Date;
}

interface PendingTask {
  id: TaskId;
  taskType: Task['type'];
  createdAt: Date;
  timeoutAt?: Date;
}

interface UserAction {
  actionId: string;
  userId: UserId;
  action: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

## Browser Interface

Web-based interface built with Vite for interacting with Oblique.

**Key Features:**
- Modern, responsive UI
- Configuration via JSON file or UI
- Real-time agent status display
- LocalStorage persistence for user preferences

## Future Enhancements

### Planned Features:
1. **Persistent Storage** - Database integration
2. **Bluesky Integration** - Monitor mentions, auto-reply
3. **Task Scheduling** - Cron-like task execution
4. **Multiple LLM Strategies** - A/B test different models
5. **Rate Limiting** - API quota management
6. **Response Caching** - Reduce API calls
7. **Metrics & Analytics** - Track usage patterns
8. **CLI Interface** - Command-line interaction option

### Extensibility Points:
- New LLM providers via `LLMClient` interface
- Alternative storage backends via `Storage` interface
- Custom task types in queue processor
- Plugin system for hooks

## Development Workflow

1. **Install dependencies**: `npm install`
2. **Set up environment**: Create `.env` with API keys
3. **Run tests**: `npm test`
4. **Development**: `npm run dev`
5. **Build**: `npm run build`
6. **Production**: `npm start`

## Design Principles Applied

### Functional Programming
- All data structures are immutable
- Functions are pure (no side effects in core logic)
- Composition over inheritance
- Higher-order functions for operations

### Type Safety
- Comprehensive TypeScript types
- No `any` types in production code
- Strict compiler options enabled
- Interface-based abstractions

### Testability
- Dependency injection for external services
- Pure functions easy to unit test
- Mock-friendly interfaces
- Comprehensive test coverage

### Simplicity
- Single responsibility per module
- Clear separation of concerns
- Minimal dependencies
- Straightforward data flow

