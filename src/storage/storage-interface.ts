// Abstract storage interface for persistence
import type { Queue } from '../core/queue.js';
import type { PendingMap } from '../core/pending-map.js';
import type { UserStackMap } from '../core/user-stack-map.js';

export interface AgentState {
  queue: Queue;
  pendingMap: PendingMap;
  userStackMap: UserStackMap;
}

export interface Storage {
  save(state: AgentState): Promise<void>;
  load(): Promise<AgentState | null>;
  clear(): Promise<void>;
}

