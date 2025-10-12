// Tests for TaskMap
import * as TaskMapOps from '../../src/drakidion/task-map.js';
import type { DrakidionTask } from '../../src/drakidion/drakidion-types.js';

describe('TaskMap', () => {
  const createMockTask = (taskId: string, status: DrakidionTask['status'] = 'ready'): DrakidionTask => ({
    taskId,
    version: 1,
    status,
    description: `Mock task ${taskId}`,
    work: `Work for ${taskId}`,
    process: async () => createMockTask(taskId, 'succeeded'),
  });
  
  describe('createTaskMap', () => {
    it('should create an empty task map', () => {
      const map = TaskMapOps.createTaskMap();
      expect(TaskMapOps.size(map)).toBe(0);
    });
  });
  
  describe('setTask', () => {
    it('should add a task to the map', () => {
      const map = TaskMapOps.createTaskMap();
      const task = createMockTask('task1');
      
      TaskMapOps.setTask(map, task);
      
      expect(TaskMapOps.hasTask(map, 'task1')).toBe(true);
      expect(TaskMapOps.size(map)).toBe(1);
    });
    
    it('should replace existing task with same taskId', () => {
      const map = TaskMapOps.createTaskMap();
      const task1 = createMockTask('task1', 'ready');
      const task2 = createMockTask('task1', 'running');
      
      TaskMapOps.setTask(map, task1);
      TaskMapOps.setTask(map, task2);
      
      const retrieved = TaskMapOps.getTask(map, 'task1');
      expect(retrieved?.status).toBe('running');
      expect(TaskMapOps.size(map)).toBe(1); // Still just one task
    });
  });
  
  describe('getTask', () => {
    it('should retrieve a task by taskId', () => {
      const map = TaskMapOps.createTaskMap();
      const task = createMockTask('task1');
      
      TaskMapOps.setTask(map, task);
      const retrieved = TaskMapOps.getTask(map, 'task1');
      
      expect(retrieved).toEqual(task);
    });
    
    it('should return undefined for non-existent taskId', () => {
      const map = TaskMapOps.createTaskMap();
      expect(TaskMapOps.getTask(map, 'nonexistent')).toBeUndefined();
    });
  });
  
  describe('removeTask', () => {
    it('should remove a task from the map', () => {
      const map = TaskMapOps.createTaskMap();
      const task = createMockTask('task1');
      
      TaskMapOps.setTask(map, task);
      TaskMapOps.removeTask(map, 'task1');
      
      expect(TaskMapOps.hasTask(map, 'task1')).toBe(false);
      expect(TaskMapOps.size(map)).toBe(0);
    });
  });
  
  describe('getAllTasks', () => {
    it('should return all tasks', () => {
      const map = TaskMapOps.createTaskMap();
      const task1 = createMockTask('task1');
      const task2 = createMockTask('task2');
      
      TaskMapOps.setTask(map, task1);
      TaskMapOps.setTask(map, task2);
      
      const allTasks = TaskMapOps.getAllTasks(map);
      expect(allTasks).toHaveLength(2);
      expect(allTasks).toContainEqual(task1);
      expect(allTasks).toContainEqual(task2);
    });
  });
  
  describe('getTasksByStatus', () => {
    it('should return tasks with specific status', () => {
      const map = TaskMapOps.createTaskMap();
      TaskMapOps.setTask(map, createMockTask('task1', 'ready'));
      TaskMapOps.setTask(map, createMockTask('task2', 'running'));
      TaskMapOps.setTask(map, createMockTask('task3', 'ready'));
      
      const readyTasks = TaskMapOps.getTasksByStatus(map, 'ready');
      expect(readyTasks).toHaveLength(2);
      expect(readyTasks.every(t => t.status === 'ready')).toBe(true);
    });
  });
  
  describe('clear', () => {
    it('should remove all tasks', () => {
      const map = TaskMapOps.createTaskMap();
      TaskMapOps.setTask(map, createMockTask('task1'));
      TaskMapOps.setTask(map, createMockTask('task2'));
      
      TaskMapOps.clear(map);
      
      expect(TaskMapOps.size(map)).toBe(0);
    });
  });
});

