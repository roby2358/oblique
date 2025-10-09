import { describe, it, expect } from '@jest/globals';
import * as Queue from '../../src/core/queue.js';
import type { Task } from '../../src/types/index.js';

describe('Queue', () => {
  const createTestTask = (id: string): Task => ({
    id,
    type: 'process_message',
    payload: { message: 'test' },
    createdAt: new Date(),
  });

  describe('createQueue', () => {
    it('should create an empty queue', () => {
      const queue = Queue.createQueue();
      expect(Queue.isEmpty(queue)).toBe(true);
      expect(Queue.size(queue)).toBe(0);
    });
  });

  describe('enqueue', () => {
    it('should add a task to the queue', () => {
      const queue = Queue.createQueue();
      const task = createTestTask('task-1');
      const newQueue = Queue.enqueue(queue, task);
      
      expect(Queue.size(newQueue)).toBe(1);
      expect(Queue.isEmpty(newQueue)).toBe(false);
    });

    it('should preserve immutability', () => {
      const queue = Queue.createQueue();
      const task = createTestTask('task-1');
      const newQueue = Queue.enqueue(queue, task);
      
      expect(Queue.size(queue)).toBe(0);
      expect(Queue.size(newQueue)).toBe(1);
    });

    it('should add multiple tasks in order', () => {
      let queue = Queue.createQueue();
      queue = Queue.enqueue(queue, createTestTask('task-1'));
      queue = Queue.enqueue(queue, createTestTask('task-2'));
      queue = Queue.enqueue(queue, createTestTask('task-3'));
      
      expect(Queue.size(queue)).toBe(3);
    });
  });

  describe('dequeue', () => {
    it('should remove and return the first task', () => {
      let queue = Queue.createQueue();
      const task1 = createTestTask('task-1');
      const task2 = createTestTask('task-2');
      
      queue = Queue.enqueue(queue, task1);
      queue = Queue.enqueue(queue, task2);
      
      const [dequeuedTask, newQueue] = Queue.dequeue(queue);
      
      expect(dequeuedTask).toEqual(task1);
      expect(Queue.size(newQueue)).toBe(1);
    });

    it('should return undefined for empty queue', () => {
      const queue = Queue.createQueue();
      const [task, newQueue] = Queue.dequeue(queue);
      
      expect(task).toBeUndefined();
      expect(Queue.isEmpty(newQueue)).toBe(true);
    });

    it('should maintain FIFO order', () => {
      let queue = Queue.createQueue();
      queue = Queue.enqueue(queue, createTestTask('task-1'));
      queue = Queue.enqueue(queue, createTestTask('task-2'));
      queue = Queue.enqueue(queue, createTestTask('task-3'));
      
      const [first] = Queue.dequeue(queue);
      expect(first?.id).toBe('task-1');
    });
  });

  describe('peek', () => {
    it('should return the first task without removing it', () => {
      let queue = Queue.createQueue();
      const task = createTestTask('task-1');
      queue = Queue.enqueue(queue, task);
      
      const peeked = Queue.peek(queue);
      
      expect(peeked).toEqual(task);
      expect(Queue.size(queue)).toBe(1);
    });

    it('should return undefined for empty queue', () => {
      const queue = Queue.createQueue();
      expect(Queue.peek(queue)).toBeUndefined();
    });
  });

  describe('findTask', () => {
    it('should find a task by id', () => {
      let queue = Queue.createQueue();
      const task = createTestTask('task-2');
      
      queue = Queue.enqueue(queue, createTestTask('task-1'));
      queue = Queue.enqueue(queue, task);
      queue = Queue.enqueue(queue, createTestTask('task-3'));
      
      const found = Queue.findTask(queue, 'task-2');
      expect(found).toEqual(task);
    });

    it('should return undefined if task not found', () => {
      const queue = Queue.createQueue();
      expect(Queue.findTask(queue, 'nonexistent')).toBeUndefined();
    });
  });

  describe('removeTask', () => {
    it('should remove a specific task by id', () => {
      let queue = Queue.createQueue();
      queue = Queue.enqueue(queue, createTestTask('task-1'));
      queue = Queue.enqueue(queue, createTestTask('task-2'));
      queue = Queue.enqueue(queue, createTestTask('task-3'));
      
      const newQueue = Queue.removeTask(queue, 'task-2');
      
      expect(Queue.size(newQueue)).toBe(2);
      expect(Queue.findTask(newQueue, 'task-2')).toBeUndefined();
      expect(Queue.findTask(newQueue, 'task-1')).toBeDefined();
      expect(Queue.findTask(newQueue, 'task-3')).toBeDefined();
    });
  });
});

