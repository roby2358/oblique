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
      const operation = jest.fn().mockResolvedValue('success');
      const task = createRetryTask(operation, 3);
      
      const successor = await task.process();
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should retry on failure', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success after retries';
      });
      
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
    });
    
    it('should give up after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Permanent failure'));
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
      const operations = [
        jest.fn().mockResolvedValue('step1'),
        jest.fn().mockResolvedValue('step2'),
        jest.fn().mockResolvedValue('step3'),
      ];
      
      let task = createTaskChain(operations);
      
      // Execute first operation
      task = await task.process();
      expect(operations[0]).toHaveBeenCalled();
      expect(task.work).toBe('step1');
      expect(task.status).toBe('ready');
      
      // Execute second operation
      task = await task.process();
      expect(operations[1]).toHaveBeenCalled();
      expect(task.work).toBe('step1\nstep2');
      expect(task.status).toBe('ready');
      
      // Execute third operation
      task = await task.process();
      expect(operations[2]).toHaveBeenCalled();
      expect(task.work).toBe('step1\nstep2\nstep3');
      expect(task.status).toBe('succeeded');
    });
    
    it('should fail if any operation fails', async () => {
      const operations = [
        jest.fn().mockResolvedValue('step1'),
        jest.fn().mockRejectedValue(new Error('step2 failed')),
        jest.fn().mockResolvedValue('step3'),
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
      expect(operations[2]).not.toHaveBeenCalled();
    });
  });
});

