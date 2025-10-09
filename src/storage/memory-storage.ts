// In-memory storage implementation
import type { Storage, AgentState } from './storage-interface.js';

export const createMemoryStorage = (): Storage => {
  let state: AgentState | null = null;

  return {
    async save(newState: AgentState): Promise<void> {
      state = newState;
    },

    async load(): Promise<AgentState | null> {
      return state;
    },

    async clear(): Promise<void> {
      state = null;
    },
  };
};

