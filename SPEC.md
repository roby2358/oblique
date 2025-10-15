# Oblique Implementation Specification

## Overview

Oblique is a conversation-based bot that responds to messages in an oblique, tangential manner using LLM APIs. The system operates as a task processing engine with two core data structures: a queue of tasks to process and a map of tasks pending asynchronous operations.

## Architecture

### Conversation-Based Task Processing Model

The system operates as a task processing engine with two primary data structures:

1. **Queue**: A FIFO queue containing all tasks waiting to be processed
2. **Pending Map**: A map of tasks currently waiting for asynchronous operations to complete

**Core Principles:**
- Each user message creates a new **conversation** with a unique random ID
- Conversations are processed as a series of **tasks** that flow through the system
- When a task requires an async operation (e.g., LLM API call), it moves from the Queue to the Pending Map
- After the async operation completes, the task moves from the Pending Map back to the Queue
- The system continuously processes tasks from the Queue in FIFO order

**Task Flow:**
```
User Message → Generate Conversation ID → Create Task → [Queue]
                                                           ↓
                                                    Process Task
                                                           ↓
                                            Needs Async? ← Yes → [Pending Map]
                                                   ↓                    ↓
                                                   No              Wait for
                                                   ↓              Completion
                                            Complete Task              ↓
                                                                Create Result Task
                                                                       ↓
                                                                   [Queue]
```

This architecture eliminates the concept of "agents" in favor of a simpler, more flexible task-based system where conversations are just sequences of tasks flowing through the queue and pending map.

### Core Components

#### 1. Queue (`src/drakidion/queue.ts`)
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

#### 2. Pending Map (`src/drakidion/pending-map.ts`)
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

### System Orchestrator (`src/drakidion/agent.ts`)

The central coordinator that manages conversations and task processing.

**Main Functions:**
- `createAgent(config)` - Initialize system with storage and hooks
- `processMessage(agent, userId, message, onComplete?)` - Create conversation task and add to queue, returns conversation ID
- `processMessageAndWait(agent, userId, message)` - Process message and wait for response (convenience function)
- `addTask(agent, task)` - Add task to queue
- `processNextTask(agent)` - Process next queued task
- `processAllTasks(agent)` - Process all tasks in queue until empty
- `getAgentStatus(agent)` - Get system metrics (queue size, pending tasks)

**System State:**
```typescript
{
  queue: Queue,           // Tasks to process
  pendingMap: PendingMap, // Tasks pending async operations
  config: AgentConfig     // Configuration
}
```

**Conversation Model:**
- Each conversation has a unique random ID
- Conversations are represented as tasks in the queue
- When a conversation requires an async operation (e.g., LLM request), it moves to the pending map
- After the async operation completes, the conversation returns to the queue
- System operates as: Queue → Process → Pending Map → Complete → Queue (for next step)

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
- `obliquePrompt(message)` - Generate prompt with instructions
- `systemPrompt` - System-level behavior definition

**Oblique Response Rules:**
- Never answer directly
- Use metaphor, analogy, allusion
- Keep responses brief (1-3 sentences)
- Maintain thematic connection
- Avoid nonsense, preserve meaning

## Data Flow

### Message Processing Flow

```
User Message → processMessage()
    ↓
1. Generate unique conversation ID (UUID)
2. Create 'process_message' task with userId, message
3. Add task to queue
4. Return [conversationId, newAgent]
    ↓
processNextTask() is called (manually or via processAllTasks())
    ↓
5. Dequeue 'process_message' task
6. Generate oblique prompt from message
7. Create 'send_llm_request' task with prompt
8. Add to both queue AND pending map
    ↓
processNextTask() called again
    ↓
9. Dequeue 'send_llm_request' task
10. Call LLM client (async)
11. LLM response received
12. Remove from pending map
13. Create 'return_response' task with response
14. Add to queue
    ↓
processNextTask() called again
    ↓
15. Dequeue 'return_response' task
16. Call onComplete callback with response
17. Save state (if auto-save enabled)
18. Conversation complete
```

**Helper Function:** `processMessageAndWait()` combines all these steps and waits for the final response.

### Task Processing Flow

```
Task Added to Queue
    ↓
1. Wait in queue (FIFO order)
2. Dequeue when ready to process
3. Determine task type:
   
   If requires async operation:
   a. Add to pending map with timeout
   b. Initiate async operation:
      - send_llm_request → Call LLM API
      - send_bluesky_post → Post to Bluesky
      - Other async operations
   c. Wait for completion
   d. Remove from pending map
   e. Create follow-up task with result
   f. Add follow-up task back to queue
   
   If synchronous operation:
   a. Process immediately
   b. Complete task
   
4. Handle errors and timeouts gracefully
5. Update system state
```

### Conversation Lifecycle

```
New Conversation (ID: random-uuid)
    ↓
[Queue] → Process initial message
    ↓
[Pending Map] → Wait for LLM response
    ↓
[Queue] → Process LLM result
    ↓
Complete conversation
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

### System Configuration

```typescript
const system = await createAgent({
  storage: createMemoryStorage(),
  llmClient: createOpenRouterClient({
    apiKey: config.openRouterApiKey,
    model: config.openRouterModel
  }),
  autoSave: true,
});
```

**Note:** The function name `createAgent` MUST be updated to reflect the conversation-based model (e.g., `createSystem` or `createConversationManager`).

## Testing

### Test Coverage

- **Core Components**: 100% coverage
  - `queue.test.ts` - 15 tests
  - `pending-map.test.ts` - 13 tests
  
- **Storage**: Full coverage
  - `memory-storage.test.ts` - 6 tests
  
- **System Orchestrator**: Integration tests
  - `agent.test.ts` - 8 tests covering task-based conversation flow
  
- **Utils & Prompts**
  - `utils/index.test.ts` - 6 tests
  - `prompts/oblique.test.ts` - 3 tests

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
type ConversationId = string; // Unique random ID for each conversation

interface Task {
  id: TaskId;
  conversationId?: ConversationId; // Optional link to conversation
  type: 'process_message' | 'send_llm_request' | 'send_bluesky_post' | 'return_response';
  payload: unknown;
  createdAt: Date;
  onComplete?: (result: unknown) => void; // Callback when task completes
}

interface PendingTask {
  id: TaskId;
  conversationId?: ConversationId; // Track which conversation this belongs to
  taskType: Task['type'];
  createdAt: Date;
  timeoutAt?: Date;
}

interface Conversation {
  id: ConversationId; // Unique random ID (e.g., UUID)
  userId: UserId;
  tasks: TaskId[]; // Tasks associated with this conversation
  status: 'queued' | 'processing' | 'pending' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}
```

**Key Requirements:**
- Conversation IDs MUST be unique random strings (e.g., UUID)
- Tasks MAY be associated with a conversation via `conversationId`
- Conversations track their tasks and current status

## Browser Interface

Web-based interface built with Vite for interacting with Oblique.

**Key Features:**
- Modern, responsive UI
- Configuration via JSON file or UI
- Real-time system status display (queue size, pending tasks)
- Conversation history view
- LocalStorage persistence for user preferences

**Status Display SHOULD Include:**
- Number of tasks in queue
- Number of pending tasks
- Active conversations
- Recent conversation history

## Future Enhancements

### Planned Features:
1. **Persistent Storage** - Database integration for conversations and tasks
2. **Bluesky Integration** - Monitor mentions, auto-reply with conversation tracking
3. **Task Scheduling** - Cron-like task execution
4. **Multiple LLM Strategies** - A/B test different models per conversation
5. **Rate Limiting** - API quota management
6. **Response Caching** - Reduce API calls for similar conversations
7. **Metrics & Analytics** - Track conversation patterns, task completion rates
8. **CLI Interface** - Command-line interaction option
9. **Conversation Prioritization** - Priority queue for urgent conversations
10. **Conversation Branching** - Support multi-turn conversations with context

### Extensibility Points:
- New LLM providers via `LLMClient` interface
- Alternative storage backends via `Storage` interface
- Custom task types in queue processor
- Plugin system for hooks
- Conversation middleware for custom processing logic

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

## Architectural Summary: Agent-Based → Conversation-Based

### Key Changes:

**Before (Agent-Based):**
- System centered around "agents" that process messages
- Agent as a stateful entity managing multiple concerns
- Less clear separation between task orchestration and processing

**After (Conversation-Based):**
- System is a task processing engine
- Conversations identified by unique random IDs
- Clear separation: Queue (waiting tasks) + Pending Map (async operations)
- Tasks flow through system: Queue → Process → Pending Map → Queue → Complete
- No "agent" concept; just tasks and conversations

### Implementation Status:

**COMPLETED:**
- ✅ Added `ConversationId` type (UUID v4 generation)
- ✅ Added `conversationId` field to `Task` and `PendingTask` interfaces
- ✅ Created `Conversation` interface to track conversation state
- ✅ Generate unique conversation ID for each user message
- ✅ Implemented task processing with Queue ↔ Pending Map transitions
- ✅ Removed `UserStackMap` and `UserAction` - system processes queue only
- ✅ Updated all tests to reflect conversation-based architecture
- ✅ Added task types: `process_message`, `send_llm_request`, `return_response`
- ✅ Implemented callback system for task completion

**FUTURE ENHANCEMENTS:**
- Add conversation history tracking with persistence
- Implement conversation-aware context retrieval (multi-turn conversations)
- Add conversation status display in UI (active/completed conversations)

**MAY:**
- Add conversation prioritization
- Implement conversation branching for multi-turn dialogs
- Add conversation middleware for extensibility

