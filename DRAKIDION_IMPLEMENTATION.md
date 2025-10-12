# DRAKIDION Implementation

This document describes the implementation of DRAKIDION in the Oblique project.

## Overview

DRAKIDION is a single-worker, browser-resident task orchestration system. It executes asynchronous and deferred tasks entirely within a web page or application context.

## Architecture

### Core Components

#### 1. **Task Model** (`drakidion-types.ts`)

Each task is an immutable snapshot with the following structure:

```typescript
interface DrakidionTask {
  taskId: string;        // 24-char safe-base32 ID
  version: number;       // Incremented on state transitions
  status: TaskStatus;    // ready | running | waiting | succeeded | retry | dead | canceled
  work: string;          // Work product being built
  process: () => Promise<DrakidionTask>;  // State transition function
  conversation?: ConversationMessage[];   // Optional conversation history
  retryCount?: number;   // Optional retry counter
  onSuccess?: (result: any) => DrakidionTask;  // Optional success callback
  onError?: (error: any) => DrakidionTask;     // Optional error callback
}
```

#### 2. **TaskMap** (`task-map.ts`)

Mutable in-memory map holding the latest task snapshot per taskId:

```typescript
const map = TaskMapOps.createTaskMap();
TaskMapOps.setTask(map, task);
const task = TaskMapOps.getTask(map, taskId);
```

#### 3. **TaskQueue** (`task-queue.ts`)

FIFO queue holding taskIds with status='ready':

```typescript
const queue = TaskQueueOps.createTaskQueue();
TaskQueueOps.enqueue(queue, taskId);
const taskId = TaskQueueOps.dequeue(queue);
```

#### 4. **WaitingMap** (`waiting-map.ts`)

Maps correlationId to taskId for tasks with status='waiting':

```typescript
const waitingMap = WaitingMapOps.createWaitingMap();
WaitingMapOps.addCorrelation(waitingMap, correlationId, taskId);
const taskId = WaitingMapOps.getTaskId(waitingMap, correlationId);
```

#### 5. **Orchestrator** (`orchestrator.ts`)

Single worker loop that processes tasks:

```typescript
const state = Orchestrator.createOrchestrator();
Orchestrator.addTask(state, task);
await Orchestrator.processNextTask(state);
```

### Task Factory Pattern

Tasks are created using factory functions that encapsulate behavior using closures:

```typescript
const createIncrementTask = (initialValue: number = 0): DrakidionTask => {
  const taskId = generateTaskId();
  
  return {
    taskId,
    version: 1,
    status: 'ready',
    work: `Count: ${initialValue}`,
    process: async () => {
      // Process and return successor task
      const nextValue = initialValue + 1;
      
      if (nextValue < 5) {
        return createIncrementTask(nextValue);
      } else {
        return { /* succeeded task */ };
      }
    },
  };
};
```

## Usage Examples

### Basic Example

```typescript
import { Orchestrator, TaskFactories, generateTaskId } from './core/drakidion.js';

// Create orchestrator
const state = Orchestrator.createOrchestrator();

// Create and add a task
const task = TaskFactories.createIncrementTask(0);
Orchestrator.addTask(state, task);

// Process all tasks
await Orchestrator.processAllTasks(state);

// Check status
const status = Orchestrator.getStatus(state);
console.log(status);
```

### LLM Task Example

```typescript
import { createLLMTask } from './core/task-factories.js';
import { createOpenRouterClient } from './hooks/llm/index.js';

const llmClient = createOpenRouterClient({
  apiKey: 'your-api-key',
  model: 'anthropic/claude-3.5-haiku',
});

const task = createLLMTask('Hello, world!', llmClient);
Orchestrator.addTask(state, task);
await Orchestrator.processNextTask(state);
```

### Waiting Task with Callbacks

```typescript
import { createWaitingTask } from './core/task-factories.js';
import { generateCorrelationId } from './utils/index.js';

const task = createWaitingTask(undefined, (result) => {
  console.log('Task completed with result:', result);
});

Orchestrator.addTask(state, task);

// Later, when async response arrives
const correlationId = /* get from somewhere */;
Orchestrator.resumeWaitingTask(state, correlationId, 'async result');
```

### Retry Task

```typescript
import { createRetryTask } from './core/task-factories.js';

const operation = async () => {
  const response = await fetch('/api/data');
  if (!response.ok) throw new Error('Failed to fetch');
  return await response.text();
};

const task = createRetryTask(operation, 3); // Retry up to 3 times
Orchestrator.addTask(state, task);
```

### Task Chain

```typescript
import { createTaskChain } from './core/task-factories.js';

const operations = [
  async () => 'Step 1 complete',
  async () => 'Step 2 complete',
  async () => 'Step 3 complete',
];

const task = createTaskChain(operations);
Orchestrator.addTask(state, task);
await Orchestrator.processAllTasks(state);
```

## ID Generation

DRAKIDION uses safe-base32 IDs (alphabet: a-z + 0-9, excluding l, 1, o, 0):

```typescript
import { generateTaskId, generateCorrelationId } from './utils/index.js';

const taskId = generateTaskId();           // 24-char safe-base32
const corrId = generateCorrelationId();    // 24-char safe-base32 starting with 'x'
```

## State Transitions

Tasks transition through a finite state machine:

- `ready` → `running`: When dequeued and processing starts
- `running` → `succeeded`: Task completes successfully
- `running` → `waiting`: Task needs to wait for async response
- `running` → `retry`: Task failed but will retry
- `running` → `dead`: Task failed permanently
- `waiting` → `ready`: Async response received, re-queue
- `retry` → `ready`: Ready to retry

## Testing

All DRAKIDION components have comprehensive unit tests:

```bash
npm test -- task-map
npm test -- task-queue
npm test -- waiting-map
npm test -- orchestrator
npm test -- task-factories
npm test -- id-generation
```

## Files

### Core Implementation
- `src/core/drakidion-types.ts` - Type definitions
- `src/core/task-map.ts` - TaskMap operations
- `src/core/task-queue.ts` - TaskQueue operations
- `src/core/waiting-map.ts` - WaitingMap operations
- `src/core/orchestrator.ts` - Orchestrator implementation
- `src/core/task-factories.ts` - Example task factories
- `src/core/drakidion.ts` - Main export file
- `src/utils/index.ts` - ID generation utilities

### Tests
- `test/core/task-map.test.ts`
- `test/core/task-queue.test.ts`
- `test/core/waiting-map.test.ts`
- `test/core/orchestrator.test.ts`
- `test/core/task-factories.test.ts`
- `test/utils/id-generation.test.ts`

## Integration with Existing Agent

The existing `Agent` class can continue to work alongside DRAKIDION. To integrate:

1. Create DRAKIDION task factories for specific operations
2. Use the Orchestrator to manage DRAKIDION tasks
3. Bridge between Agent's Task type and DRAKIDION's DrakidionTask type

Example bridge:

```typescript
// Convert Agent message to DRAKIDION task
const agentMessageToDrakidionTask = (
  userId: string,
  message: string,
  llmClient: LLMClient
): DrakidionTask => {
  return createLLMTask(message, llmClient);
};
```

## Compliance with DRAKIDION Spec

✅ **Task Model**
- Immutable task snapshots
- 24-character safe-base32 taskId
- Version tracking
- Status enum (ready, running, waiting, succeeded, retry, dead, canceled)
- process() → Promise<Task> state transition
- Optional conversation, retryCount, onSuccess, onError

✅ **Data Structures**
- TaskMap: Mutable map (taskId → latest snapshot)
- TaskQueue: FIFO queue of taskIds with status='ready'
- WaitingMap: correlationId → taskId for status='waiting'

✅ **Orchestrator**
- Single worker loop
- Sequential task processing (no concurrent executions)
- FIFO ordering
- Browser-resident (uses requestAnimationFrame)

✅ **IDs**
- taskId: 24-char safe-base32 (a-z + 0-9, excluding l, 1, o, 0)
- correlationId: 24-char safe-base32 starting with 'x'

✅ **State Transitions**
- Pure functions from snapshot to snapshot
- No in-place mutation
- Automatic routing to correct structures based on status

✅ **Error Handling**
- Errors logged with console.log()
- Retry logic in task implementations
- onError callbacks for custom error handling

✅ **Concurrency**
- Single orchestrator per window/tab
- No cross-tab coordination
- Stops when window closes

