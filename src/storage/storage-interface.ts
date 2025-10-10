// Abstract storage interface for persistence
import type { Task } from '../types/index.js';
import type { PendingMap } from '../core/pending-map.js';

export interface AgentState {
  queue: ReadonlyArray<Task>;
  pendingMap: PendingMap;
}

export interface Storage {
  save(state: AgentState): Promise<void>;
  load(): Promise<AgentState | null>;
  clear(): Promise<void>;
}

