# Drakidion

This document defines the design and behavioral requirements for a single-worker, browser-resident task orchestration system. The system executes asynchronous and deferred tasks entirely within a web page or application context.

Each task is modeled as an immutable snapshot representing one version of its state. A mutable in-memory map "taskMap" (taskId → latest snapshot) holds only the newest version. Tasks progress through a finite state machine that determines whether they are actively queued for execution in "taskQueue" or waiting on an external asynchronous event in "waitingMap".

The design intentionally collapses scheduling concerns into a single event loop running in the browser "Orchestrator", avoiding complexities of distribution.

## Design Summary

### Single worker loop: "Orchestrator"

Only one active processing loop runs at any time. It continuously consumes due tasks from an in-memory queue ordered by FIFO.

### Immutable task snapshots. "Task"

Each task is an object returned from a factory function (a closure). The factory function captures state and returns an object containing at minimum:
- taskId:string
  - taskId MUST be a random safe-base32 string of 24 characters
  - safe-base32 is the alphabet a-z plus 0-9 excluding l, 1, o, 0 (32 characters total)
  - Within a task chain, all successor tasks MUST share the same taskId
  - Only the initial task in a chain generates a new taskId
- version:int
  - MUST be incremented when a task creates its successor (version++)
  - MUST start at 1 for new task chains
  - Within a chain, versions form a sequence: 1, 2, 3, etc.
- createdAt: Date
  - MUST be set when the initial task is created
  - MUST be preserved across all successor tasks in the chain
- status: string
  - MUST be one of: ready, running, waiting, succeeded, retry, dead, canceled
- work: string
  - work is the ongoing work product being built, for example a document or tweet
- process: () -> Promise<Task>
  - process the task and return a promise resolving to the successor task
- (optional) conversation: [{source:string, text: string}]
  - used to carry ongoing conversations with an LLM
- (optional) retryCount: int
- (optional) doneAt: Date
  - MUST be set when task reaches a terminal state (succeeded, dead, canceled)
- (optional) onSuccess: (result: any) -> Task
  - callback function that returns successor task on successful async completion
- (optional) onError: (error: any) -> Task
  - callback function that returns successor task on error

#### Task Chain Identity

Tasks form logical chains where each successor inherits the taskId from its predecessor. This enables:
- Execution tracing: Fetch all tasks by taskId, sort by version to see complete history
- Single-threaded semantics: Each chain has one identifier representing a logical "job"
- Version tracking: The version field tracks progress through the chain

Example chain:
```
Step 1: taskId=abc123, version=1, status=ready
Step 2: taskId=abc123, version=2, status=waiting  
Step 3: taskId=abc123, version=3, status=succeeded
```

#### Task Creation Helpers

The system provides helper functions for creating tasks:

- `newReadyTask(description)` - Starts a new task chain (fresh taskId, version=1, status=ready)
- `newWaitingTask(description)` - Starts a new task chain for async operations (fresh taskId, version=1, status=waiting)
- `nextTask(predecessor)` - Creates a successor in existing chain (same taskId, version+1, inherits fields)

These helpers return objects designed to be spread with additional fields:
```typescript
const task: DrakidionTask = {
  ...newReadyTask(description),
  work: 'some work',
  process: async () => { /* ... */ }
};
```

#### Task State Transitions

Creating a new state produces a new task object. If the status is "ready" it goes into the taskQueue, if it's "waiting" it goes into the waitingMap using the taskId as the correlation key. The previous task state is discarded. Any other states are left in the taskMap without further action.

Different task types are implemented as different factory functions (e.g., createProcessNotificationTask, createSendToLLMTask) that return objects with this common structure but encapsulate type-specific behavior in their closures.

Successor task creation follows a consistent pattern:
- Define helper functions (e.g., `createTaskSucceededTask`, `createTaskDeadTask`)
- These helpers use `nextTask(predecessor)` to inherit taskId and increment version
- Main task factory references these helpers in `onSuccess` and `onError` callbacks

In the first implementation, tasks are held in memory only and not persisted. This closure-based design may be revisited when persistence is added.

### Mutable task map. "taskMap"

The task map is a key–value store of the latest task snapshot per taskId.

Queue "taskQueue" holds tasks with status = "ready"

The waiting registry "waitingMap" holds tasks in status = "waiting" that are paused pending asynchronous responses. The taskId is used as the correlation key for tracking waiting tasks.

The state machine behind each task determines which structure it belongs to.

### Mutable task queue "taskQueue"

A separate structure that carries a list of task ids that are ready to be worked on, kept in FIFO order as a queue.

It's a convenience structure, because you could get the same thing by iterating values in the taskMap, but we want to avoid that.

### Mutable waiting map "waitingMap"

Maps taskId to taskId { taskId: string -> taskId: string } for tasks in waiting state.

The taskId serves as the correlation key when tracking waiting tasks. Since all tasks in a chain share the same taskId, the waitingMap holds only one entry per logical task chain at any given time. When an async operation completes, it references the task chain by its taskId to resume processing.

The waitingMap works in conjunction with the onSuccess and onError callback hooks defined on tasks. When a waiting task's async operation completes, the callbacks use `nextTask()` to create successor tasks (with incremented version) that the orchestrator then processes.

Note that task implementation is free to define its own callback hooks in addition to onSuccess and onError. Those are just a baseline. A task does not need to define them if its internal logic doesn't include callbacks.

### State transitions.

After we process a task (taken from the queue or an event happens for a task in the waitingMap), it will act as a state transition function process() -> task. The returned task represents the current state and replaces it in the taskMap. The successor task MUST have the same taskId and an incremented version.

Transitions are pure functions from one snapshot to the next. No task mutates its state in place. Successor tasks are created using `nextTask(predecessor)` to ensure taskId continuity and proper version incrementing.

Common transitions: 
- ready → running (when processing starts)
- running → succeeded (successful completion)
- running → waiting (awaiting async result)
- waiting → ready (on async response via onSuccess)
- running → retry (temporary failure)
- retry → ready (retry attempt)
- Terminal states: succeeded, dead, canceled

Individual task implementations are responsible for defining valid state transitions. The `nextTask()` helper ensures that taskId and version are properly managed across transitions.

### Leadership and concurrency.

We only have a observer/taskQueue/waitingMap in the current window/tab. If the window/tab closes, they go away. We don't have to worry about contention from other windows or tabs.

### Async responses.

External events reference task chains via their taskId. When a response arrives, the orchestrator finds the corresponding task in the waitingMap using the taskId, then invokes the task's onSuccess or onError callback to generate a new snapshot (with same taskId, incremented version), and processes it accordingly.

The typical pattern:
1. Task factory initiates async operation and returns a waiting task
2. Async operation completes and invokes the completion callback with taskId
3. Orchestrator calls task's onSuccess/onError to create successor task using `nextTask()`
4. Successor task inherits taskId, gets version+1, and is processed (queued if ready, or terminal if succeeded/dead)

Example:
```typescript
// Initial waiting task: taskId=abc123, version=2, status=waiting
const task = {
  ...newWaitingTask(description),
  onSuccess: (result) => createTaskSucceededTask(task, result),
  // createTaskSucceededTask uses nextTask() internally:
  // return { ...nextTask(task), status: 'succeeded', ... }
  // Results in: taskId=abc123, version=3, status=succeeded
};
```

### Error handling and retries.

Deffered in the initial implementation. Errors are written to console.log, and retries are implemented in the task implememtation.

## Implementation Pattern

A complete task factory implementation follows this pattern:

```typescript
// 1. Define successor task helper functions
const createMyTaskSucceededTask = (
  task: DrakidionTask,
  result: string
): DrakidionTask => {
  return {
    ...nextTask(task),  // Inherits taskId, increments version
    status: 'succeeded',
    work: result,
    conversation: task.conversation,
    doneAt: new Date(),
  };
};

const createMyTaskDeadTask = (
  task: DrakidionTask,
  error: any
): DrakidionTask => {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
  return {
    ...nextTask(task),  // Inherits taskId, increments version
    status: 'dead',
    work: `Error: ${errorMsg}`,
    conversation: task.conversation,
    doneAt: new Date(),
  };
};

// 2. Define main task factory
export const createMyTask = (
  input: string,
  someClient: Client,
  onComplete: (taskId: string, result?: any, error?: any) => void
): DrakidionTask => {
  const description = `My task: ${input}`;

  // For a READY task (synchronous work):
  const task: DrakidionTask = {
    ...newReadyTask(description),  // Starts new chain
    work: input,
    process: async () => {
      try {
        const result = await someClient.doWork(input);
        return createMyTaskSucceededTask(task, result);
      } catch (error) {
        return createMyTaskDeadTask(task, error);
      }
    },
  };

  // For a WAITING task (asynchronous with callbacks):
  const waitingTask: DrakidionTask = {
    ...newWaitingTask(description),  // Starts new chain
    work: 'Waiting for async response...',
    onSuccess: (result: any) => createMyTaskSucceededTask(waitingTask, result.data),
    onError: (error: any) => createMyTaskDeadTask(waitingTask, error),
  };

  // Initiate async operation
  someClient.asyncOperation(input)
    .then(result => onComplete(waitingTask.taskId, result))
    .catch(error => onComplete(waitingTask.taskId, undefined, error));

  return task; // or waitingTask for async
};
```

This pattern ensures:
- Consistent taskId threading through the chain
- Automatic version incrementing
- Clean separation of concerns (helpers vs. factory)
- Proper terminal state handling with `doneAt`

## Technical Requirements

### General

MUST operate entirely within a single browser execution context (e.g., Service Worker, Web Worker, or main thread event loop).

SHOULD avoid reliance on setInterval for core scheduling; use an adaptive loop or requestIdleCallback when idle.

### Task Model

MUST represent each task as an immutable snapshot object; updates create new snapshots.

MUST store only the latest snapshot per taskId in the mutable map.

MUST define a finite set of valid statuses (ready, running, waiting, succeeded, retry, dead, canceled).

MUST ensure all successor tasks in a chain share the same taskId as their predecessor.

MUST increment version number for each successor task (version = predecessor.version + 1).

MUST start new task chains at version 1.

MUST preserve createdAt timestamp across all tasks in a chain.

SHOULD use helper functions (`newReadyTask`, `newWaitingTask`, `nextTask`) to ensure consistent task creation.

### Queue and Scheduling

MUST process tasks sequentially; no concurrent executions.

### Async and Waiting

MUST track asynchronous tasks using the waitingMap (taskId → taskId).

MUST allow external responses to resume waiting tasks through their taskId.

MUST use onSuccess and onError callbacks to create successor tasks when async operations complete.

MUST ensure successor tasks created by onSuccess/onError callbacks inherit the same taskId and increment version.

SHOULD use `nextTask(predecessor)` in callback implementations to ensure proper taskId threading.

SHOULD reject or ignore stale async responses that reference tasks no longer in the waitingMap.

### Error Handling

MUST log all errors and warnings with console.log()

### Concurrency and Coordination

MUST ensure only one worker loop runs at a time per logical user context.

MUST stop with the enclosing tab or window closes (it shouldn't keep running)

## Non-Goals

Distributed or multi-process coordination beyond leader election.

Cross-user synchronization or shared queues between browsers.

Exactly-once semantics or cryptographic event signing.

