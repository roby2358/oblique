## Technical Requirements

### General

MUST operate entirely within a single browser execution context (e.g., Service Worker, Web Worker, or main thread event loop).

SHOULD use requestAnimationFrame for core scheduling to ensure browser-friendly execution timing.

### Task Model

MUST represent each task as an immutable snapshot object; updates create new snapshots.

MUST store only the latest snapshot per taskId in the mutable map.

MUST define a finite set of valid statuses (ready, running, waiting, succeeded, retry, dead, canceled).

MUST ensure all successor tasks in a chain share the same taskId as their predecessor.

MUST use 24-character safe-base32 strings for taskId (a-z + 0-9 excluding l, 1, o, 0).

MUST increment version number for each successor task (version = predecessor.version + 1).

MUST start new task chains at version 1.

MUST preserve createdAt timestamp across all tasks in a chain.

MUST set doneAt timestamp when task reaches terminal states (succeeded, dead, canceled).

SHOULD use helper functions (`newReadyTask`, `newWaitingTask`, `nextTask`) to ensure consistent task creation.

### Queue and Scheduling

MUST process tasks sequentially; no concurrent executions.

### Async and Waiting

MUST track asynchronous tasks using the waitingSet (Set<string>).

MUST allow external responses to resume waiting tasks through their taskId.

MUST use external completion callbacks to create successor tasks when async operations complete.

MUST ensure successor tasks created by external callbacks inherit the same taskId and increment version.

SHOULD use `nextTask(predecessor)` in callback implementations to ensure proper taskId threading.

MUST reject or ignore stale async responses that reference tasks no longer in the waitingSet.

MUST remove tasks from waitingSet when they transition to non-waiting states.

### Error Handling

MUST log all errors and warnings with console.log() or console.error()

### Concurrency and Coordination

MUST ensure only one worker loop runs at a time per logical user context.

MUST stop when the enclosing tab or window closes (it shouldn't keep running)

## Non-Goals

Distributed or multi-process coordination beyond leader election.

Cross-user synchronization or shared queues between browsers.

Exactly-once semantics or cryptographic event signing.
