import { describe, it, expect } from '@jest/globals';
import { Queue } from '../../src/core/queue.js';
import type { Task } from '../../src/types/index.js';

describe('Queue', () => {
  const createTestTask = (id: string): Task => ({
    id,
    type: 'process_message',
    payload: { message: 'test' },
    createdAt: new Date(),
  });

  describe('create', () => {
    it('should create an empty queue', () => {
      const queue = Queue.create();
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it('should create a queue from existing tasks', () => {
      const tasks = [createTestTask('task-1')];
      
      const queue = Queue.create(tasks);
      expect(queue.size()).toBe(1);
      expect(queue.isEmpty()).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('should add a task to the queue', () => {
      const queue = Queue.create();
      const task = createTestTask('task-1');
      
      queue.enqueue(task);
      
      expect(queue.size()).toBe(1);
      expect(queue.isEmpty()).toBe(false);
    });

    it('should return this for chaining', () => {
      const queue = Queue.create();
      const result = queue.enqueue(createTestTask('task-1'));
      
      expect(result).toBe(queue);
    });

    it('should add multiple tasks in order', () => {
      const queue = Queue.create();
      
      queue
        .enqueue(createTestTask('task-1'))
        .enqueue(createTestTask('task-2'))
        .enqueue(createTestTask('task-3'));
      
      expect(queue.size()).toBe(3);
    });
  });

  describe('dequeue', () => {
    it('should remove and return the first task', () => {
      const queue = Queue.create();
      const task1 = createTestTask('task-1');
      const task2 = createTestTask('task-2');
      
      queue.enqueue(task1).enqueue(task2);
      
      const dequeuedTask = queue.dequeue();
      
      expect(dequeuedTask).toEqual(task1);
      expect(queue.size()).toBe(1);
    });

    it('should return undefined for empty queue', () => {
      const queue = Queue.create();
      const task = queue.dequeue();
      
      expect(task).toBeUndefined();
      expect(queue.isEmpty()).toBe(true);
    });

    it('should maintain FIFO order', () => {
      const queue = Queue.create();
      queue
        .enqueue(createTestTask('task-1'))
        .enqueue(createTestTask('task-2'))
        .enqueue(createTestTask('task-3'));
      
      const first = queue.dequeue();
      expect(first?.id).toBe('task-1');
      
      const second = queue.dequeue();
      expect(second?.id).toBe('task-2');
    });
  });

  describe('peek', () => {
    it('should return the first task without removing it', () => {
      const queue = Queue.create();
      const task = createTestTask('task-1');
      queue.enqueue(task);
      
      const peeked = queue.peek();
      
      expect(peeked).toEqual(task);
      expect(queue.size()).toBe(1);
    });

    it('should return undefined for empty queue', () => {
      const queue = Queue.create();
      expect(queue.peek()).toBeUndefined();
    });
  });

  describe('findTask', () => {
    it('should find a task by id', () => {
      const queue = Queue.create();
      const task = createTestTask('task-2');
      
      queue
        .enqueue(createTestTask('task-1'))
        .enqueue(task)
        .enqueue(createTestTask('task-3'));
      
      const found = queue.findTask('task-2');
      expect(found).toEqual(task);
    });

    it('should return undefined if task not found', () => {
      const queue = Queue.create();
      expect(queue.findTask('nonexistent')).toBeUndefined();
    });
  });

  describe('removeTask', () => {
    it('should remove a specific task by id', () => {
      const queue = Queue.create();
      queue
        .enqueue(createTestTask('task-1'))
        .enqueue(createTestTask('task-2'))
        .enqueue(createTestTask('task-3'));
      
      queue.removeTask('task-2');
      
      expect(queue.size()).toBe(2);
      expect(queue.findTask('task-2')).toBeUndefined();
      expect(queue.findTask('task-1')).toBeDefined();
      expect(queue.findTask('task-3')).toBeDefined();
    });

    it('should return this for chaining', () => {
      const queue = Queue.create();
      queue.enqueue(createTestTask('task-1'));
      
      const result = queue.removeTask('task-1');
      expect(result).toBe(queue);
    });
  });

  describe('getTasks', () => {
    it('should return all tasks as an array', () => {
      const queue = Queue.create();
      const task1 = createTestTask('task-1');
      const task2 = createTestTask('task-2');
      
      queue.enqueue(task1).enqueue(task2);
      
      const tasks = queue.getTasks();
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual(task1);
      expect(tasks[1]).toEqual(task2);
    });

    it('should return empty array for empty queue', () => {
      const queue = Queue.create();
      expect(queue.getTasks()).toHaveLength(0);
    });
  });
});

