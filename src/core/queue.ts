// Sequential task queue implementation
import type { Task, TaskId } from '../types/index.js';

export interface Queue {
  readonly tasks: ReadonlyArray<Task>;
}

export const createQueue = (): Queue => ({
  tasks: [],
});

export const enqueue = (queue: Queue, task: Task): Queue => ({
  tasks: [...queue.tasks, task],
});

export const dequeue = (queue: Queue): [Task | undefined, Queue] => {
  const [first, ...rest] = queue.tasks;
  return [first, { tasks: rest }];
};

export const peek = (queue: Queue): Task | undefined => {
  return queue.tasks[0];
};

export const isEmpty = (queue: Queue): boolean => {
  return queue.tasks.length === 0;
};

export const size = (queue: Queue): number => {
  return queue.tasks.length;
};

export const findTask = (queue: Queue, taskId: TaskId): Task | undefined => {
  return queue.tasks.find(task => task.id === taskId);
};

export const removeTask = (queue: Queue, taskId: TaskId): Queue => ({
  tasks: queue.tasks.filter(task => task.id !== taskId),
});

