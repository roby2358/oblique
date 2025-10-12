# Drakion Future

## Future extensions (not yet)

MUST capture and persist errors within each snapshot (lastError).

MUST mark tasks exceeding MAX_ATTEMPTS as terminal (dead).

MUST maintain a priority queue ordered by (priority DESC, nextRunAt ASC).

MUST only dequeue tasks whose nextRunAt ≤ now.

SHOULD include metadata fields attempts, priority, and nextRunAt to control scheduling.

MUST persist every new snapshot before acknowledging completion to the handler.

MUST support exponential backoff with jitter for retries.

MUST prevent circular or invalid transitions (e.g., succeeded → running).

SHOULD support seamless resume after reload using IndexedDB or equivalent persistent storage.

SHOULD implement a configurable queue length threshold for backpressure.

SHOULD persist queue state after every transition to enable recovery.

MUST enforce timeouts for waiting tasks; expired entries transition to retry.

MUST restore all tasks on reload and resume processing those in ready state.

SHOULD periodically compact or prune old terminal tasks to control storage size.

MUST guarantee idempotent reconstruction (restoring twice yields identical state).

MUST use a heartbeat and expiry mechanism for leader election.

SHOULD reassign leadership automatically when the current leader tab closes.

SHOULD provide hooks or events for monitoring failures, completions, and retries.

### Backpressure and Performance

MUST halt promotion of new tasks when queue length exceeds threshold.

MUST automatically resume promotions when queue depth drops below threshold.

SHOULD adapt polling interval based on observed load (shorter under pressure, longer when idle).

SHOULD expose metrics: number of ready tasks, in-flight tasks, retries, average latency.

Integrity and Idempotency

MUST maintain exactly one active worker loop per logical application using leader election when multiple tabs are open.

If multiple tabs or windows exist, only one Orchestrator instance (the “leader”) runs the worker loop. Leader election uses BroadcastChannel and a heartbeat key in localStorage with an expiry. Non-leaders may submit tasks but do not process them.

MUST guarantee at-least-once execution semantics.

MUST avoid duplicate side effects by maintaining idempotency fences in task snapshots.

MUST ignore external responses that reference non-current task versions or IDs.

SHOULD support user-initiated cancellation through an abort controller.

Failures append a new snapshot with incremented attempts and an updated nextRunAt using exponential backoff and random jitter. A task exceeding MAX_ATTEMPTS transitions to dead. It transitions to a status dead task with all the other properties intact

### Idempotency.

Each snapshot may record a set of executed side effects (effects). Before performing an external action, handlers check this fence to prevent duplicates during retries.

Persistence
The taskMap will be backed by IndexedDB, and the taskMap, taskQueue, and waitingSet will be restored from IndexedDB

Backpressure and pacing.
Backpressure is applied by pausing promotion of new ready tasks when the queue exceeds a configurable threshold. As the queue drains, promotion resumes automatically.

Timeouts.
Each waiting task registers a safety timeout. If the timeout expires without an external response, the task automatically transitions to a retry state via a new snapshot.

Persistence hygiene.
To avoid unbounded growth, stale tasks in terminal states may be purged after a TTL period. Deletion removes entries from both the map and persistence layer.

