// Sequential task queue implementation
import type { Task, TaskId } from '../types/index.js';

/**
 * Queue class that manages sequential task processing.
 * Uses functional data structures internally.
 */
export class Queue {
  private tasks: ReadonlyArray<Task>;

  private constructor(tasks: ReadonlyArray<Task>) {
    this.tasks = tasks;
  }

  /**
   * Create a new Queue instance
   */
  static create(initialTasks?: ReadonlyArray<Task>): Queue {
    return new Queue(initialTasks ?? []);
  }

  /**
   * Add a task to the queue
   */
  enqueue(task: Task): this {
    this.tasks = [...this.tasks, task];
    return this;
  }

  /**
   * Remove and return the first task
   */
  dequeue(): Task | undefined {
    const [first, ...rest] = this.tasks;
    this.tasks = rest;
    return first;
  }

  /**
   * View the first task without removing it
   */
  peek(): Task | undefined {
    return this.tasks[0];
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  /**
   * Get the number of tasks in the queue
   */
  size(): number {
    return this.tasks.length;
  }

  /**
   * Find a task by ID
   */
  findTask(taskId: TaskId): Task | undefined {
    return this.tasks.find(task => task.id === taskId);
  }

  /**
   * Remove a specific task by ID
   */
  removeTask(taskId: TaskId): this {
    this.tasks = this.tasks.filter(task => task.id !== taskId);
    return this;
  }

  /**
   * Get all tasks as an array (for serialization)
   */
  getTasks(): ReadonlyArray<Task> {
    return this.tasks;
  }
}

