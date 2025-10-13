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
  - roll this as a distinct utility function
- version:int
  - MUST be incremented when a task creates its successor
- status: string
  - MUST be one of: ready, running, waiting, succeeded, retry, dead, canceled
- work: string
  - work is the ongoing work product being built, for example a document or tweet
- process: () -> Promise<Task>
  - process the task and return a promise resolving to the successor task
- (optional) conversation: [{source:string, text: string}]
  - used to carry ongoing conversations with an LLM
- (optional) retryCount: int
- (optional) onSuccess: (result: any) -> Task
  - callback function that returns successor task on successful async completion
- (optional) onError: (error: any) -> Task
  - callback function that returns successor task on error

Creating a new state produces a new task object from a factory function. If the status is "ready" it goes into the taskQueue, if it's "waiting" it goes into the waitingMap using the taskId as the correlation key. The previous task state is discarded. Any other states are left in the taskMap without further action.

Different task types are implemented as different factory functions (e.g., createLLMTask, createPostTask) that return objects with this common structure but encapsulate type-specific behavior in their closures.

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

The taskId serves as the correlation key when tracking waiting tasks. This simplifies the API since we only need one identifier per task. When an async operation completes, it references the task by its taskId to resume processing.

The waitingMap works in conjunction with the onSuccess and onError callback hooks defined on tasks. When a waiting task's async operation completes, the callbacks create successor tasks that the orchestrator then processes.

Note that task implementation is free to define its own callback hooks in addition to onSuccess and onError. Those are just a baseline. A task does not need to define them if its internal logic doesn't include callbacks.

### State transitions.

After we process a task (taken from the queue or an event happens for a task in the waitingMap), it will act as a state transition function process() -> task. The returned task represents the current state and replaces it in the taskMap.

Transitions are pure functions from one snapshot to the next. No task mutates its state in place.
Common transitions: ready → running, running → succeeded, running → waiting, waiting → ready (on async response), running → retry, retry → ready, and terminal states such as dead or canceled.

Individual task implementations are responsible for defining valid state transitions.

### Leadership and concurrency.

We only have a observer/taskQueue/waitingMap in the current window/tab. If the window/tab closes, they go away. We don't have to worry about contention from other windows or tabs.

### Async responses.

External events reference tasks via their taskId. When a response arrives, the orchestrator finds the corresponding task in the waitingMap using the taskId, then invokes the task's onSuccess or onError callback to generate a new snapshot, and processes it accordingly.

The typical pattern:
1. Task factory initiates async operation and returns a waiting task
2. Async operation completes and invokes the completion callback with taskId
3. Orchestrator calls task's onSuccess/onError to create successor task
4. Successor task is processed (queued if ready, or terminal if succeeded/dead)

### Error handling and retries.

Deffered in the initial implementation. Errors are written to console.log, and retries are implemented in the task implememtation.

## Technical Requirements

### General

MUST operate entirely within a single browser execution context (e.g., Service Worker, Web Worker, or main thread event loop).

SHOULD avoid reliance on setInterval for core scheduling; use an adaptive loop or requestIdleCallback when idle.

### Task Model

MUST represent each task as an immutable snapshot object; updates create new snapshots.

MUST store only the latest snapshot per taskId in the mutable map.

MUST define a finite set of valid statuses (ready, running, waiting, succeeded, retry, dead, canceled).

### Queue and Scheduling

MUST process tasks sequentially; no concurrent executions.

### Async and Waiting

MUST track asynchronous tasks using the waitingMap (taskId → taskId).

MUST allow external responses to resume waiting tasks through their taskId.

MUST use onSuccess and onError callbacks to create successor tasks when async operations complete.

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

