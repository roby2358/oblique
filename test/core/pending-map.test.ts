import { describe, it, expect } from '@jest/globals';
import * as PendingMap from '../../src/core/pending-map.js';
import type { PendingTask } from '../../src/types/index.js';

describe('PendingMap', () => {
  const createTestPendingTask = (id: string, timeoutMs?: number): PendingTask => ({
    id,
    taskType: 'process_message',
    createdAt: new Date(),
    timeoutAt: timeoutMs ? new Date(Date.now() + timeoutMs) : undefined,
  });

  describe('createPendingMap', () => {
    it('should create an empty pending map', () => {
      const map = PendingMap.createPendingMap();
      expect(PendingMap.size(map)).toBe(0);
    });
  });

  describe('addPending', () => {
    it('should add a pending task', () => {
      const map = PendingMap.createPendingMap();
      const task = createTestPendingTask('task-1');
      const newMap = PendingMap.addPending(map, task);
      
      expect(PendingMap.size(newMap)).toBe(1);
      expect(PendingMap.hasPending(newMap, 'task-1')).toBe(true);
    });

    it('should preserve immutability', () => {
      const map = PendingMap.createPendingMap();
      const task = createTestPendingTask('task-1');
      const newMap = PendingMap.addPending(map, task);
      
      expect(PendingMap.size(map)).toBe(0);
      expect(PendingMap.size(newMap)).toBe(1);
    });

    it('should overwrite existing task with same id', () => {
      let map = PendingMap.createPendingMap();
      const task1 = createTestPendingTask('task-1', 1000);
      const task2 = createTestPendingTask('task-1', 2000);
      
      map = PendingMap.addPending(map, task1);
      map = PendingMap.addPending(map, task2);
      
      expect(PendingMap.size(map)).toBe(1);
      const retrieved = PendingMap.getPending(map, 'task-1');
      expect(retrieved?.timeoutAt).toEqual(task2.timeoutAt);
    });
  });

  describe('removePending', () => {
    it('should remove a pending task', () => {
      let map = PendingMap.createPendingMap();
      map = PendingMap.addPending(map, createTestPendingTask('task-1'));
      map = PendingMap.addPending(map, createTestPendingTask('task-2'));
      
      const newMap = PendingMap.removePending(map, 'task-1');
      
      expect(PendingMap.size(newMap)).toBe(1);
      expect(PendingMap.hasPending(newMap, 'task-1')).toBe(false);
      expect(PendingMap.hasPending(newMap, 'task-2')).toBe(true);
    });

    it('should handle removing nonexistent task', () => {
      const map = PendingMap.createPendingMap();
      const newMap = PendingMap.removePending(map, 'nonexistent');
      
      expect(PendingMap.size(newMap)).toBe(0);
    });
  });

  describe('getPending', () => {
    it('should retrieve a pending task', () => {
      let map = PendingMap.createPendingMap();
      const task = createTestPendingTask('task-1');
      map = PendingMap.addPending(map, task);
      
      const retrieved = PendingMap.getPending(map, 'task-1');
      expect(retrieved).toEqual(task);
    });

    it('should return undefined for nonexistent task', () => {
      const map = PendingMap.createPendingMap();
      expect(PendingMap.getPending(map, 'nonexistent')).toBeUndefined();
    });
  });

  describe('getAllPending', () => {
    it('should return all pending tasks', () => {
      let map = PendingMap.createPendingMap();
      map = PendingMap.addPending(map, createTestPendingTask('task-1'));
      map = PendingMap.addPending(map, createTestPendingTask('task-2'));
      map = PendingMap.addPending(map, createTestPendingTask('task-3'));
      
      const all = PendingMap.getAllPending(map);
      expect(all).toHaveLength(3);
    });

    it('should return empty array for empty map', () => {
      const map = PendingMap.createPendingMap();
      expect(PendingMap.getAllPending(map)).toEqual([]);
    });
  });

  describe('getExpiredPending', () => {
    it('should return expired tasks', () => {
      let map = PendingMap.createPendingMap();
      
      // Add tasks with different timeouts
      map = PendingMap.addPending(map, createTestPendingTask('task-1', -1000)); // Expired
      map = PendingMap.addPending(map, createTestPendingTask('task-2', 1000));  // Not expired
      map = PendingMap.addPending(map, createTestPendingTask('task-3', -500));  // Expired
      
      const expired = PendingMap.getExpiredPending(map);
      expect(expired).toHaveLength(2);
      expect(expired.map(t => t.id).sort()).toEqual(['task-1', 'task-3']);
    });

    it('should not include tasks without timeout', () => {
      let map = PendingMap.createPendingMap();
      map = PendingMap.addPending(map, createTestPendingTask('task-1'));
      
      const expired = PendingMap.getExpiredPending(map);
      expect(expired).toHaveLength(0);
    });
  });
});

