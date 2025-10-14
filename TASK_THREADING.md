# Task ID Threading Implementation

## Overview

Implemented **strict (taskId, version) identity** for task chains in the Drakidion system. All successor tasks in a logical sequence now share the same `taskId` with incrementing `version` numbers.

## Design Decision

### Previous Behavior
- Each new task got a unique `taskId`
- Tasks were connected via callbacks
- No easy way to trace a complete task chain

### New Behavior
- Initial task generates a `taskId` (version 1)
- All successor tasks inherit the same `taskId`
- Version increments with each step: v1 → v2 → v3
- Each task is single-threaded (sequential execution)

## Benefits

1. **Execution Tracing**: Fetch all tasks by `taskId`, sort by `version` to see complete history
2. **Logical Grouping**: All steps in a "job" share the same identifier
3. **Debugging**: Easy to follow task progression through the system
4. **Version Tracking**: Natural use of the version field for step tracking

## Implementation

### Core Helper Functions

```typescript
// Create new task - starts a new chain (fresh taskId, version 1)
newReadyTask(description: string)
newWaitingTask(description: string)

// Create successor task - inherits taskId, increments version
nextTask(predecessor: DrakidionTask)
```

### Example: Oblique Task Chain

```typescript
// Step 1: Process Notification - START NEW CHAIN
const processTask: DrakidionTask = {
  ...newReadyTask(description),  // taskId: abc123, version: 1
  work: notification.text,
  process: async () => { /* ... */ }
}

// Step 2: Send to LLM - SUCCESSOR TASK
const llmTask: DrakidionTask = {
  ...nextTask(processTask),  // taskId: abc123, version: 2
  status: 'waiting',
  description: 'Oblique...',
  onSuccess: /* ... */,
  onError: /* ... */
}

// Step 3: Post Reply - SUCCESSOR TASK
const postTask: DrakidionTask = {
  ...nextTask(llmTask),  // taskId: abc123, version: 3
  status: 'ready',
  description: 'Post reply...',
  process: async () => { /* ... */ }
}
```

All three tasks share `taskId: abc123` with versions 1, 2, and 3.

### Key Pattern

- **New chain**: Use `newReadyTask()` or `newWaitingTask()` - generates fresh taskId
- **Successor**: Use `nextTask(predecessor)` - inherits taskId, increments version

## Example Output

```
✅ Task threading verified: taskId=w6vminz8f58mhi4zmnxgp59q
   Step 1 (Process):  w6vminz8f58mhi4zmnxgp59q v1
   Step 2 (LLM):      w6vminz8f58mhi4zmnxgp59q v2
   Step 3 (Post):     w6vminz8f58mhi4zmnxgp59q v3

📊 Execution trace for taskId=w6vminz8f58mhi4zmnxgp59q:
   v1: ready      | Process notification from @testuser.bsky.social
   v2: waiting    | Oblique: Hello Oblique!
   v3: ready      | Post reply to @testuser.bsky.social
```

## Testing

- **Unit tests**: 93 tests passing (various test files)
- **Integration tests**: 2 tests passing (task-threading.test.ts)
- **Total**: 95 tests passing

See `test/integration/task-threading.test.ts` for comprehensive examples.

## API

### Factory Functions

#### `newReadyTask(description)`
Creates a **new task chain** starting point.
- **description**: Task description (required)
- **Returns**: Object with fresh `taskId`, `version: 1`, `status: 'ready'`, and defaults
- **Use**: Starting a new task chain

#### `newWaitingTask(description)`
Creates a **new task chain** starting point for async operations.
- **description**: Task description (required)
- **Returns**: Object with fresh `taskId`, `version: 1`, `status: 'waiting'`, and defaults
- **Use**: Starting a new task chain that waits for async results

#### `nextTask(predecessor)`
Creates a **successor task** in an existing chain.
- **predecessor**: The previous task in the chain (required)
- **Returns**: Object with same `taskId`, `version + 1`, and inherited fields
- **Use**: Creating subsequent steps in a task chain

### Usage Pattern

```typescript
// Start a new chain
const task1 = { ...newReadyTask('Step 1'), /* overrides */ };

// Add successors
const task2 = { ...nextTask(task1), status: 'waiting', /* overrides */ };
const task3 = { ...nextTask(task2), status: 'ready', /* overrides */ };
```

## Future Considerations

- Consider adding `rootTaskId` if we need to branch tasks while maintaining lineage
- Could add task chain visualization tools using taskId + version sorting
- Might want helper function `createSuccessorTask(predecessor, status)` to automate threading

