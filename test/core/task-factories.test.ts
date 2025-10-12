// Tests for Task Factories
import { createIncrementTask, createRetryTask, createTaskChain } from '../../src/core/task-factories.js';

describe('Task Factories', () => {
  describe('createIncrementTask', () => {
    it('should create a task with initial value', () => {
      const task = createIncrementTask(0);
      
      expect(task.version).toBe(1);
      expect(task.status).toBe('ready');
      expect(task.work).toBe('Count: 0');
      expect(task.taskId).toHaveLength(24);
    });
    
    it('should increment value when processed', async () => {
      const task = createIncrementTask(0);
      const successor = await task.process();
      
      expect(successor.work).toBe('Count: 1');
    });
    
    it('should complete after reaching 5', async () => {
      const task = createIncrementTask(4);
      const successor = await task.process();
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toBe('Count: 5 (completed)');
    });
  });
  
  describe('createRetryTask', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        return 'success';
      };
      const task = createRetryTask(operation, 3);
      
      const successor = await task.process();
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toBe('success');
      expect(callCount).toBe(1);
    });
    
    it('should retry on failure', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success after retries';
      };
      
      let task = createRetryTask(operation, 3);
      
      // First attempt - fails
      task = await task.process();
      expect(task.status).toBe('ready');
      expect(task.retryCount).toBe(1);
      
      // Second attempt - fails
      task = await task.process();
      expect(task.status).toBe('ready');
      expect(task.retryCount).toBe(2);
      
      // Third attempt - succeeds
      task = await task.process();
      expect(task.status).toBe('succeeded');
      expect(task.work).toBe('success after retries');
      expect(attempts).toBe(3);
    });
    
    it('should give up after max retries', async () => {
      const operation = async () => {
        throw new Error('Permanent failure');
      };
      let task = createRetryTask(operation, 2);
      
      // Attempt 1
      task = await task.process();
      expect(task.status).toBe('ready');
      
      // Attempt 2
      task = await task.process();
      expect(task.status).toBe('ready');
      
      // Attempt 3 - give up
      task = await task.process();
      expect(task.status).toBe('dead');
      expect(task.work).toContain('Failed after 2 retries');
    });
  });
  
  describe('createTaskChain', () => {
    it('should execute operations sequentially', async () => {
      const callCounts = [0, 0, 0];
      const operations = [
        async () => { callCounts[0]++; return 'step1'; },
        async () => { callCounts[1]++; return 'step2'; },
        async () => { callCounts[2]++; return 'step3'; },
      ];
      
      let task = createTaskChain(operations);
      
      // Execute first operation
      task = await task.process();
      expect(callCounts[0]).toBe(1);
      expect(task.work).toBe('step1');
      expect(task.status).toBe('ready');
      
      // Execute second operation
      task = await task.process();
      expect(callCounts[1]).toBe(1);
      expect(task.work).toBe('step1\nstep2');
      expect(task.status).toBe('ready');
      
      // Execute third operation
      task = await task.process();
      expect(callCounts[2]).toBe(1);
      expect(task.work).toBe('step1\nstep2\nstep3');
      expect(task.status).toBe('succeeded');
    });
    
    it('should fail if any operation fails', async () => {
      const callCounts = [0, 0, 0];
      const operations = [
        async () => { callCounts[0]++; return 'step1'; },
        async () => { callCounts[1]++; throw new Error('step2 failed'); },
        async () => { callCounts[2]++; return 'step3'; },
      ];
      
      let task = createTaskChain(operations);
      
      // Execute first operation
      task = await task.process();
      expect(task.status).toBe('ready');
      
      // Execute second operation - fails
      task = await task.process();
      expect(task.status).toBe('dead');
      expect(task.work).toContain('Failed at step 2');
      
      // Third operation should not be called
      expect(callCounts[2]).toBe(0);
    });
  });
});

