// Tests for WaitingSet
import * as WaitingSetOps from '../../src/drakidion/waiting-map.js';

describe('WaitingSet', () => {
  describe('createWaitingSet', () => {
    it('should create an empty waiting set', () => {
      const set = WaitingSetOps.createWaitingSet();
      expect(WaitingSetOps.size(set)).toBe(0);
    });
  });
  
  describe('addWaitingTask', () => {
    it('should add a taskId to the waiting set', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      WaitingSetOps.addWaitingTask(set, 'task1');
      
      expect(WaitingSetOps.isWaiting(set, 'task1')).toBe(true);
      expect(WaitingSetOps.size(set)).toBe(1);
    });
    
    it('should not add duplicate taskIds', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      WaitingSetOps.addWaitingTask(set, 'task1');
      WaitingSetOps.addWaitingTask(set, 'task1');
      
      expect(WaitingSetOps.isWaiting(set, 'task1')).toBe(true);
      expect(WaitingSetOps.size(set)).toBe(1);
    });
  });
  
  describe('isWaiting', () => {
    it('should return true for waiting taskIds', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      WaitingSetOps.addWaitingTask(set, 'task1');
      
      expect(WaitingSetOps.isWaiting(set, 'task1')).toBe(true);
    });
    
    it('should return false for non-waiting taskIds', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      expect(WaitingSetOps.isWaiting(set, 'task1')).toBe(false);
    });
  });
  
  describe('removeWaitingTask', () => {
    it('should remove a taskId from the waiting set', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      WaitingSetOps.addWaitingTask(set, 'task1');
      WaitingSetOps.removeWaitingTask(set, 'task1');
      
      expect(WaitingSetOps.isWaiting(set, 'task1')).toBe(false);
      expect(WaitingSetOps.size(set)).toBe(0);
    });
    
    it('should handle removing non-existent taskIds gracefully', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      WaitingSetOps.removeWaitingTask(set, 'task1');
      
      expect(WaitingSetOps.isWaiting(set, 'task1')).toBe(false);
      expect(WaitingSetOps.size(set)).toBe(0);
    });
  });
  
  describe('getAllWaitingTaskIds', () => {
    it('should return all waiting taskIds', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      WaitingSetOps.addWaitingTask(set, 'task1');
      WaitingSetOps.addWaitingTask(set, 'task2');
      
      const taskIds = WaitingSetOps.getAllWaitingTaskIds(set);
      expect(taskIds).toHaveLength(2);
      expect(taskIds).toContain('task1');
      expect(taskIds).toContain('task2');
    });
    
    it('should return empty array for empty set', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      const taskIds = WaitingSetOps.getAllWaitingTaskIds(set);
      expect(taskIds).toHaveLength(0);
    });
  });
  
  describe('size', () => {
    it('should return correct size', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      expect(WaitingSetOps.size(set)).toBe(0);
      
      WaitingSetOps.addWaitingTask(set, 'task1');
      expect(WaitingSetOps.size(set)).toBe(1);
      
      WaitingSetOps.addWaitingTask(set, 'task2');
      expect(WaitingSetOps.size(set)).toBe(2);
      
      WaitingSetOps.removeWaitingTask(set, 'task1');
      expect(WaitingSetOps.size(set)).toBe(1);
    });
  });
  
  describe('clear', () => {
    it('should remove all taskIds from the waiting set', () => {
      const set = WaitingSetOps.createWaitingSet();
      
      WaitingSetOps.addWaitingTask(set, 'task1');
      WaitingSetOps.addWaitingTask(set, 'task2');
      
      WaitingSetOps.clear(set);
      
      expect(WaitingSetOps.size(set)).toBe(0);
      expect(WaitingSetOps.isWaiting(set, 'task1')).toBe(false);
      expect(WaitingSetOps.isWaiting(set, 'task2')).toBe(false);
    });
  });
});