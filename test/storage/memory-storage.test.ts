import { describe, it, expect } from '@jest/globals';
import { createMemoryStorage } from '../../src/storage/memory-storage.js';
import { createPendingMap } from '../../src/core/pending-map.js';

describe('MemoryStorage', () => {
  describe('save and load', () => {
    it('should save and load state', async () => {
      const storage = createMemoryStorage();
      const state = {
        queue: [],
        pendingMap: createPendingMap(),
      };

      await storage.save(state);
      const loaded = await storage.load();

      expect(loaded).toEqual(state);
    });

    it('should return null when no state saved', async () => {
      const storage = createMemoryStorage();
      const loaded = await storage.load();

      expect(loaded).toBeNull();
    });

    it('should overwrite previous state on save', async () => {
      const storage = createMemoryStorage();
      
      const state1 = {
        queue: [],
        pendingMap: createPendingMap(),
      };

      const state2 = {
        queue: [],
        pendingMap: createPendingMap(),
      };

      await storage.save(state1);
      await storage.save(state2);
      
      const loaded = await storage.load();
      expect(loaded).toEqual(state2);
    });
  });

  describe('clear', () => {
    it('should clear saved state', async () => {
      const storage = createMemoryStorage();
      const state = {
        queue: [],
        pendingMap: createPendingMap(),
      };

      await storage.save(state);
      await storage.clear();
      
      const loaded = await storage.load();
      expect(loaded).toBeNull();
    });

    it('should handle clearing when no state exists', async () => {
      const storage = createMemoryStorage();
      await storage.clear();
      
      const loaded = await storage.load();
      expect(loaded).toBeNull();
    });
  });
});

