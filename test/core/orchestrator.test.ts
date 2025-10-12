// Tests for Orchestrator
import * as Orchestrator from '../../src/core/orchestrator.js';
import type { DrakidionTask } from '../../src/core/drakidion-types.js';
import { generateTaskId } from '../../src/utils/index.js';

describe('Orchestrator', () => {
  const createMockTask = (
    taskId: string,
    status: DrakidionTask['status'] = 'ready',
    processResult?: DrakidionTask
  ): DrakidionTask => ({
    taskId,
    version: 1,
    status,
    work: `Work for ${taskId}`,
    process: async () => {
      if (processResult) {
        return processResult;
      }
      // Default: transition to succeeded
      return {
        taskId,
        version: 2,
        status: 'succeeded',
        work: `Completed ${taskId}`,
        process: async () => {
          throw new Error('Task already completed');
        },
      };
    },
  });
  
  describe('createOrchestrator', () => {
    it('should create a new orchestrator state', () => {
      const state = Orchestrator.createOrchestrator();
      
      const status = Orchestrator.getStatus(state);
      expect(status.isRunning).toBe(false);
      expect(status.queueSize).toBe(0);
      expect(status.waitingSize).toBe(0);
      expect(status.totalTasks).toBe(0);
    });
  });
  
  describe('addTask', () => {
    it('should add a ready task to taskMap and taskQueue', () => {
      const state = Orchestrator.createOrchestrator();
      const task = createMockTask('task1', 'ready');
      
      Orchestrator.addTask(state, task);
      
      const status = Orchestrator.getStatus(state);
      expect(status.totalTasks).toBe(1);
      expect(status.queueSize).toBe(1);
      expect(status.waitingSize).toBe(0);
    });
    
    it('should add a waiting task to taskMap and waitingMap', () => {
      const state = Orchestrator.createOrchestrator();
      const task = createMockTask('task1', 'waiting');
      
      Orchestrator.addTask(state, task);
      
      const status = Orchestrator.getStatus(state);
      expect(status.totalTasks).toBe(1);
      expect(status.queueSize).toBe(0);
      expect(status.waitingSize).toBe(1);
    });
    
    it('should add a succeeded task only to taskMap', () => {
      const state = Orchestrator.createOrchestrator();
      const task = createMockTask('task1', 'succeeded');
      
      Orchestrator.addTask(state, task);
      
      const status = Orchestrator.getStatus(state);
      expect(status.totalTasks).toBe(1);
      expect(status.queueSize).toBe(0);
      expect(status.waitingSize).toBe(0);
    });
  });
  
  describe('processNextTask', () => {
    it('should process a task and transition to successor', async () => {
      const state = Orchestrator.createOrchestrator();
      const task = createMockTask('task1', 'ready');
      
      Orchestrator.addTask(state, task);
      
      const result = await Orchestrator.processNextTask(state);
      
      expect(result.processed).toBe(true);
      
      const status = Orchestrator.getStatus(result.state);
      expect(status.queueSize).toBe(0); // Processed and not re-queued
      expect(status.totalTasks).toBe(1); // Still in taskMap
    });
    
    it('should return processed=false for empty queue', async () => {
      const state = Orchestrator.createOrchestrator();
      
      const result = await Orchestrator.processNextTask(state);
      
      expect(result.processed).toBe(false);
    });
    
    it('should handle task that transitions to ready (re-queues)', async () => {
      const state = Orchestrator.createOrchestrator();
      
      const taskId = generateTaskId();
      const successorTask = createMockTask(taskId, 'ready');
      const task = createMockTask(taskId, 'ready', successorTask);
      
      Orchestrator.addTask(state, task);
      
      const result = await Orchestrator.processNextTask(state);
      
      const status = Orchestrator.getStatus(result.state);
      expect(status.queueSize).toBe(1); // Re-queued
    });
    
    it('should handle task errors', async () => {
      const state = Orchestrator.createOrchestrator();
      
      const errorTask: DrakidionTask = {
        taskId: 'task1',
        version: 1,
        status: 'ready',
        work: 'Will fail',
        process: async () => {
          throw new Error('Test error');
        },
      };
      
      Orchestrator.addTask(state, errorTask);
      
      const result = await Orchestrator.processNextTask(state);
      
      expect(result.processed).toBe(true);
      
      const status = Orchestrator.getStatus(result.state);
      expect(status.totalTasks).toBe(1);
      expect(status.queueSize).toBe(0);
    });
  });
  
  describe('processAllTasks', () => {
    it('should process all tasks in the queue', async () => {
      const state = Orchestrator.createOrchestrator();
      
      Orchestrator.addTask(state, createMockTask('task1', 'ready'));
      Orchestrator.addTask(state, createMockTask('task2', 'ready'));
      Orchestrator.addTask(state, createMockTask('task3', 'ready'));
      
      const finalState = await Orchestrator.processAllTasks(state);
      
      const status = Orchestrator.getStatus(finalState);
      expect(status.queueSize).toBe(0);
      expect(status.totalTasks).toBe(3);
    });
  });
  
  describe('resumeWaitingTask', () => {
    it('should resume a waiting task with onSuccess callback', () => {
      const state = Orchestrator.createOrchestrator();
      
      const task: DrakidionTask = {
        taskId: 'task1',
        version: 1,
        status: 'waiting',
        work: 'Waiting...',
        process: async () => task,
        onSuccess: (result: any) => ({
          taskId: 'task1',
          version: 2,
          status: 'succeeded',
          work: `Result: ${result}`,
          process: async () => {
            throw new Error('Done');
          },
        }),
      };
      
      Orchestrator.addTask(state, task);
      
      // Get the auto-generated correlationId from waitingMap
      const correlationIds = state.waitingMap.correlations.keys();
      const correlationId = Array.from(correlationIds)[0];
      
      const newState = Orchestrator.resumeWaitingTask(state, correlationId, 'test result');
      
      const status = Orchestrator.getStatus(newState);
      expect(status.waitingSize).toBe(0);
      expect(status.totalTasks).toBe(1);
    });
  });
  
  describe('errorWaitingTask', () => {
    it('should handle error for waiting task with onError callback', () => {
      const state = Orchestrator.createOrchestrator();
      
      const task: DrakidionTask = {
        taskId: 'task1',
        version: 1,
        status: 'waiting',
        work: 'Waiting...',
        process: async () => task,
        onError: (error: any) => ({
          taskId: 'task1',
          version: 2,
          status: 'dead',
          work: `Error: ${error.message}`,
          process: async () => {
            throw new Error('Failed');
          },
        }),
      };
      
      Orchestrator.addTask(state, task);
      
      // Get the auto-generated correlationId
      const correlationIds = state.waitingMap.correlations.keys();
      const correlationId = Array.from(correlationIds)[0];
      
      const newState = Orchestrator.errorWaitingTask(
        state,
        correlationId,
        new Error('Test error')
      );
      
      const status = Orchestrator.getStatus(newState);
      expect(status.waitingSize).toBe(0);
      expect(status.totalTasks).toBe(1);
    });
  });
});

