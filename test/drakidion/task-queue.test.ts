// Tests for TaskQueue
import * as TaskQueueOps from '../../src/drakidion/task-queue.js';

describe('TaskQueue', () => {
  describe('createTaskQueue', () => {
    it('should create an empty queue', () => {
      const queue = TaskQueueOps.createTaskQueue();
      expect(TaskQueueOps.isEmpty(queue)).toBe(true);
      expect(TaskQueueOps.size(queue)).toBe(0);
    });
  });
  
  describe('enqueue', () => {
    it('should add taskIds to the queue', () => {
      const queue = TaskQueueOps.createTaskQueue();
      
      TaskQueueOps.enqueue(queue, 'task1');
      TaskQueueOps.enqueue(queue, 'task2');
      
      expect(TaskQueueOps.size(queue)).toBe(2);
      expect(TaskQueueOps.isEmpty(queue)).toBe(false);
    });
  });
  
  describe('dequeue', () => {
    it('should remove and return taskIds in FIFO order', () => {
      const queue = TaskQueueOps.createTaskQueue();
      
      TaskQueueOps.enqueue(queue, 'task1');
      TaskQueueOps.enqueue(queue, 'task2');
      TaskQueueOps.enqueue(queue, 'task3');
      
      expect(TaskQueueOps.dequeue(queue)).toBe('task1');
      expect(TaskQueueOps.dequeue(queue)).toBe('task2');
      expect(TaskQueueOps.dequeue(queue)).toBe('task3');
      expect(TaskQueueOps.dequeue(queue)).toBeUndefined();
    });
    
    it('should return undefined for empty queue', () => {
      const queue = TaskQueueOps.createTaskQueue();
      expect(TaskQueueOps.dequeue(queue)).toBeUndefined();
    });
  });
  
  describe('peek', () => {
    it('should return first taskId without removing it', () => {
      const queue = TaskQueueOps.createTaskQueue();
      
      TaskQueueOps.enqueue(queue, 'task1');
      TaskQueueOps.enqueue(queue, 'task2');
      
      expect(TaskQueueOps.peek(queue)).toBe('task1');
      expect(TaskQueueOps.size(queue)).toBe(2); // Still 2
      expect(TaskQueueOps.peek(queue)).toBe('task1'); // Still task1
    });
  });
  
  describe('contains', () => {
    it('should check if a taskId is in the queue', () => {
      const queue = TaskQueueOps.createTaskQueue();
      
      TaskQueueOps.enqueue(queue, 'task1');
      TaskQueueOps.enqueue(queue, 'task2');
      
      expect(TaskQueueOps.contains(queue, 'task1')).toBe(true);
      expect(TaskQueueOps.contains(queue, 'task2')).toBe(true);
      expect(TaskQueueOps.contains(queue, 'task3')).toBe(false);
    });
  });
  
  describe('remove', () => {
    it('should remove a specific taskId from the queue', () => {
      const queue = TaskQueueOps.createTaskQueue();
      
      TaskQueueOps.enqueue(queue, 'task1');
      TaskQueueOps.enqueue(queue, 'task2');
      TaskQueueOps.enqueue(queue, 'task3');
      
      TaskQueueOps.remove(queue, 'task2');
      
      expect(TaskQueueOps.size(queue)).toBe(2);
      expect(TaskQueueOps.contains(queue, 'task2')).toBe(false);
      expect(TaskQueueOps.dequeue(queue)).toBe('task1');
      expect(TaskQueueOps.dequeue(queue)).toBe('task3');
    });
  });
  
  describe('getAllTaskIds', () => {
    it('should return all taskIds as an array', () => {
      const queue = TaskQueueOps.createTaskQueue();
      
      TaskQueueOps.enqueue(queue, 'task1');
      TaskQueueOps.enqueue(queue, 'task2');
      TaskQueueOps.enqueue(queue, 'task3');
      
      const allIds = TaskQueueOps.getAllTaskIds(queue);
      expect(allIds).toEqual(['task1', 'task2', 'task3']);
    });
  });
  
  describe('clear', () => {
    it('should remove all taskIds', () => {
      const queue = TaskQueueOps.createTaskQueue();
      
      TaskQueueOps.enqueue(queue, 'task1');
      TaskQueueOps.enqueue(queue, 'task2');
      
      TaskQueueOps.clear(queue);
      
      expect(TaskQueueOps.isEmpty(queue)).toBe(true);
      expect(TaskQueueOps.size(queue)).toBe(0);
    });
  });
});

