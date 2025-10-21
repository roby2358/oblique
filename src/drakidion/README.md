# Drakidion

This document defines the design and behavioral requirements for a single-worker, browser-resident task orchestration system. The system executes asynchronous and deferred tasks entirely within a web page or application context.

Each task is modeled as an immutable snapshot representing one version of its state. A mutable in-memory map "taskMap" (taskId → latest snapshot) holds only the newest version. Tasks progress through a finite state machine that determines whether they are actively queued for execution in "taskQueue" or waiting on an external asynchronous event in "waitingSet".

The design intentionally collapses scheduling concerns into a single event loop running in the browser "Orchestrator", avoiding complexities of distribution.

## Design Summary

### Single worker loop: "Orchestrator"

Only one active processing loop runs at any time. It continuously consumes due tasks from an in-memory queue ordered by FIFO.

### Immutable task snapshots. "Task"

Each task is an object returned from a factory function (a closure). The factory function captures state and returns an object containing at minimum:
- taskId: string
  - taskId MUST be a random safe-base32 string of 24 characters
  - safe-base32 is the alphabet a-z plus 0-9 excluding l, 1, o, 0 (32 characters total)
  - Within a task chain, all successor tasks MUST share the same taskId
  - Only the initial task in a chain generates a new taskId
- version: number
  - MUST be incremented when a task creates its successor (version++)
  - MUST start at 1 for new task chains
  - Within a chain, versions form a sequence: 1, 2, 3, etc.
- status: TaskStatus
  - MUST be one of: 'ready', 'running', 'waiting', 'succeeded', 'retry', 'dead', 'canceled'
- description: string
  - Human-readable description of the task
- work: string
  - work is the ongoing work product being built, for example a document or tweet
- process: () -> DrakidionTask
  - process the task and return the successor task
- (optional) conversation: ConversationMessage[]
  - used to carry ongoing conversations with an LLM
  - ConversationMessage has structure: {role: string, content: string}
- (optional) retryCount: number
- (optional) createdAt: Date
  - MUST be set when the initial task is created
  - MUST be preserved across all successor tasks in the chain
- (optional) doneAt: Date
  - MUST be set when task reaches a terminal state (succeeded, dead, canceled)

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

- `newReadyTask(description)` - Starts a new task chain (fresh taskId, version=1, status='ready')
- `newWaitingTask(description)` - Starts a new task chain for async operations (fresh taskId, version=1, status='waiting')
- `nextTask(predecessor)` - Creates a successor in existing chain (same taskId, version+1, inherits fields)
- `createSucceededTask(predecessor)` - Creates a succeeded successor task
- `createDeadTask(predecessor)` - Creates a dead successor task

These helpers return objects designed to be spread with additional fields:
```typescript
const task: DrakidionTask = {
  ...newReadyTask(description),
  work: 'some work',
  process: async () => { /* ... */ }
};
```

#### Task State Transitions

Creating a new state produces a new task object. If the status is "ready" it goes into the taskQueue, if it's "waiting" it goes into the waitingSet. The previous task state is discarded. Any other states are left in the taskMap without further action.

Different task types are implemented as different factory functions (e.g., createProcessNotificationTask, createSendToLLMTask) that return objects with this common structure but encapsulate type-specific behavior in their closures.

Successor task creation follows a consistent pattern:
- Define helper functions (e.g., `createTaskSucceededTask`, `createTaskDeadTask`)
- These helpers use `nextTask(predecessor)` to inherit taskId and increment version
- Main task factory references these helpers in `onSuccess` and `onError` callbacks

In the first implementation, tasks are held in memory only and not persisted. This closure-based design may be revisited when persistence is added.

### Mutable task map. "taskMap"

The task map is a key–value store of the latest task snapshot per taskId.

Queue "taskQueue" holds tasks with status = "ready"

The waiting registry "waitingSet" holds taskIds for tasks in status = "waiting" that are paused pending asynchronous responses.

The state machine behind each task determines which structure it belongs to.

### Mutable task queue "taskQueue"

A separate structure that carries a list of task ids that are ready to be worked on, kept in FIFO order as a queue.

It's a convenience structure, because you could get the same thing by iterating values in the taskMap, but we want to avoid that.

### Mutable waiting set "waitingSet"

A set of taskIds for tasks with status='waiting'.

The waitingSet tracks which taskIds are currently in waiting state. Since all tasks in a chain share the same taskId, the waitingSet holds only one entry per logical task chain at any given time. When an async operation completes, it references the task chain by its taskId to resume processing.

The waitingSet works in conjunction with external completion callbacks. When a waiting task's async operation completes, the external system calls the orchestrator's `resumeWaitingTask()` or `errorWaitingTask()` methods with the taskId and a successor task that the orchestrator then processes.

### State transitions.

After we process a task (taken from the queue or an event happens for a task in the waitingSet), it will act as a state transition function process() -> task. The returned task represents the current state and replaces it in the taskMap. The successor task MUST have the same taskId and an incremented version.

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

We only have a observer/taskQueue/waitingSet in the current window/tab. If the window/tab closes, they go away. We don't have to worry about contention from other windows or tabs.

### Async responses.

External events reference task chains via their taskId. When a response arrives, the orchestrator finds the corresponding task in the waitingSet using the taskId, then transitions to a successor task provided by the external system.

The typical pattern:
1. Task factory initiates async operation and returns a waiting task
2. Task factory registers the task in waitingSet with taskId
3. Async operation completes and calls orchestrator's `resumeWaitingTask()` or `errorWaitingTask()` with taskId and successor task
4. Orchestrator transitions to the successor task (queued if ready, or terminal if succeeded/dead)

### Error handling and retries.

Deferred in the initial implementation. Errors are written to console.log, and retries are implemented in the task implementation.
