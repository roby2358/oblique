// Tests for Orchestrator
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as Orchestrator from '../../src/drakidion/orchestrator.js';
import * as TaskMapOps from '../../src/drakidion/task-map.js';
import type { DrakidionTask } from '../../src/drakidion/drakidion-types.js';
import { generateTaskId } from '../../src/utils/index.js';

describe('Orchestrator', () => {
  // Suppress console output during tests for cleaner output
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockTask = (
    taskId: string,
    status: DrakidionTask['status'] = 'ready',
    processResult?: DrakidionTask
  ): DrakidionTask => ({
    taskId,
    version: 1,
    status,
    description: `Mock task ${taskId}`,
    work: `Work for ${taskId}`,
    createdAt: new Date(),
    process: () => {
      if (processResult) {
        return processResult;
      }
      // Default: transition to succeeded
      return {
        taskId,
        version: 2,
        status: 'succeeded',
        description: `Mock task ${taskId}`,
        work: `Completed ${taskId}`,
        createdAt: new Date(),
        doneAt: new Date(),
        process: () => {
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
        description: 'Error task',
        work: 'Will fail',
        createdAt: new Date(),
        process: () => {
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
  
  // R-7: resuming a waiting chain, and refusing to resume one that is not waiting
  describe('resumeWaitingTask / errorWaitingTask', () => {
    const waitingTask = (taskId: string): DrakidionTask => ({
      taskId,
      version: 1,
      status: 'waiting',
      description: 'Waiting task',
      work: 'Waiting...',
      createdAt: new Date(),
      process: () => {
        throw new Error('A waiting task is never processed');
      },
    });

    const terminalSuccessor = (
      task: DrakidionTask,
      status: DrakidionTask['status'],
      work: string
    ): DrakidionTask => ({
      ...task,
      version: task.version + 1,
      status,
      work,
      doneAt: new Date(),
      process: () => {
        throw new Error('Done');
      },
    });

    it('should resume a waiting task with successor task', () => {
      const state = Orchestrator.createOrchestrator();
      const task = waitingTask('task1');

      Orchestrator.addTask(state, task);

      const newState = Orchestrator.resumeWaitingTask(
        state,
        task.taskId,
        terminalSuccessor(task, 'succeeded', 'Result: test result')
      );

      const status = Orchestrator.getStatus(newState);
      expect(status.waitingSize).toBe(0);
      expect(status.totalTasks).toBe(1);
    });

    it('should handle error for waiting task with successor task', () => {
      const state = Orchestrator.createOrchestrator();
      const task = waitingTask('task1');

      Orchestrator.addTask(state, task);

      const newState = Orchestrator.errorWaitingTask(
        state,
        task.taskId,
        terminalSuccessor(task, 'dead', 'Error: Test error')
      );

      const status = Orchestrator.getStatus(newState);
      expect(status.waitingSize).toBe(0);
      expect(status.totalTasks).toBe(1);
    });

    it('should warn and leave state unchanged for a taskId absent from taskMap', () => {
      const state = Orchestrator.createOrchestrator();
      const task = waitingTask('ghost');

      const newState = Orchestrator.resumeWaitingTask(
        state,
        task.taskId,
        terminalSuccessor(task, 'succeeded', 'Never admitted')
      );

      const status = Orchestrator.getStatus(newState);
      expect(status.totalTasks).toBe(0);
      expect(status.waitingSize).toBe(0);
      expect(status.queueSize).toBe(0);
      expect(console.warn).toHaveBeenCalled();
    });

    it('should ignore a repeated callback rather than transition the chain twice', () => {
      const state = Orchestrator.createOrchestrator();
      const task = waitingTask('task1');

      Orchestrator.addTask(state, task);

      const first = terminalSuccessor(task, 'succeeded', 'Result: the real one');
      Orchestrator.resumeWaitingTask(state, task.taskId, first);

      const second = terminalSuccessor(first, 'succeeded', 'Result: the duplicate');
      const newState = Orchestrator.resumeWaitingTask(state, task.taskId, second);

      // The terminal snapshot from the first callback survives untouched
      const stored = TaskMapOps.getTask(newState.taskMap, task.taskId);
      expect(stored?.version).toBe(2);
      expect(stored?.work).toBe('Result: the real one');
      expect(Orchestrator.getStatus(newState).totalTasks).toBe(1);
      expect(console.warn).toHaveBeenCalled();
    });

    it('should ignore a late failure callback for a chain that already succeeded', () => {
      const state = Orchestrator.createOrchestrator();
      const task = waitingTask('task1');

      Orchestrator.addTask(state, task);

      const succeeded = terminalSuccessor(task, 'succeeded', 'Result: confirmed');
      Orchestrator.resumeWaitingTask(state, task.taskId, succeeded);

      const late = terminalSuccessor(succeeded, 'dead', 'Error: arrived too late');
      const newState = Orchestrator.errorWaitingTask(state, task.taskId, late);

      const stored = TaskMapOps.getTask(newState.taskMap, task.taskId);
      expect(stored?.status).toBe('succeeded');
      expect(stored?.work).toBe('Result: confirmed');
      expect(console.warn).toHaveBeenCalled();
    });

    it('should not re-queue a ready chain that a stale callback resumes', () => {
      const state = Orchestrator.createOrchestrator();
      const task = waitingTask('task1');

      Orchestrator.addTask(state, task);

      // The chain resumes into more work: it is ready and queued, no longer waiting
      const readyAgain: DrakidionTask = {
        ...task,
        version: 2,
        status: 'ready',
        work: 'More work',
      };
      Orchestrator.resumeWaitingTask(state, task.taskId, readyAgain);
      expect(Orchestrator.getStatus(state).queueSize).toBe(1);

      const stale = terminalSuccessor(readyAgain, 'succeeded', 'Result: stale');
      const newState = Orchestrator.resumeWaitingTask(state, task.taskId, stale);

      // The queued work is still queued, not replaced by the stale terminal snapshot
      const status = Orchestrator.getStatus(newState);
      expect(status.queueSize).toBe(1);
      expect(TaskMapOps.getTask(newState.taskMap, task.taskId)?.status).toBe('ready');
      expect(console.warn).toHaveBeenCalled();
    });
  });
});

