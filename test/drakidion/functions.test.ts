// Unit tests for DRAKIDION function builders
import { describe, it, expect } from '@jest/globals';
import { createTaskFromFunction, type TaskFunction } from '../../src/drakidion/functions.js';

describe('createTaskFromFunction', () => {
  it('should create a ready task with the correct properties', () => {
    const mockFunction: TaskFunction = () => ({ work: 'Test work' });
    const description = 'Test task';
    
    const task = createTaskFromFunction(description, mockFunction);
    
    expect(task.status).toBe('ready');
    expect(task.description).toBe(description);
    expect(task.version).toBe(1);
    expect(task.work).toBe('');
    expect(typeof task.process).toBe('function');
    expect(task.taskId).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]{24}$/); // safe-base32 format
  });

  it('should execute the function and create a succeeded task on success', async () => {
    let callCount = 0;
    const mockFunction: TaskFunction = () => {
      callCount++;
      return { 
        work: 'Custom work from function',
        description: 'Updated description'
      };
    };
    const description = 'Test successful task';
    
    const task = createTaskFromFunction(description, mockFunction);
    const result = await task.process();
    
    expect(callCount).toBe(1);
    expect(result.status).toBe('succeeded');
    expect(result.description).toBe('Updated description');
    expect(result.work).toBe('Custom work from function');
    expect(result.doneAt).toBeInstanceOf(Date);
  });

  it('should handle empty partial task correctly', async () => {
    const mockFunction: TaskFunction = () => ({});
    const description = 'Test empty partial task';
    
    const task = createTaskFromFunction(description, mockFunction);
    const result = await task.process();
    
    expect(result.status).toBe('succeeded');
    expect(result.description).toBe(description);
    expect(result.work).toBe('');
  });

  it('should create a dead task when function throws an error', async () => {
    const errorMessage = 'Test error';
    const mockFunction: TaskFunction = () => {
      throw new Error(errorMessage);
    };
    const description = 'Test error task';
    
    const task = createTaskFromFunction(description, mockFunction);
    const result = await task.process();
    
    expect(result.status).toBe('dead');
    expect(result.description).toBe(description);
    expect(result.work).toContain(`[Function failed: ${errorMessage}]`);
    expect(result.doneAt).toBeInstanceOf(Date);
    expect(result.version).toBe(2); // Should increment version
  });

  it('should handle non-Error exceptions', async () => {
    const mockFunction: TaskFunction = () => {
      throw 'String error';
    };
    const description = 'Test non-error exception';
    
    const task = createTaskFromFunction(description, mockFunction);
    const result = await task.process();
    
    expect(result.status).toBe('dead');
    expect(result.work).toContain('[Function failed: Unknown error]');
  });

  it('should handle partial task with custom status', async () => {
    const mockFunction: TaskFunction = () => ({
      work: 'Custom work',
      status: 'waiting' as const,
      conversation: [{ role: 'user', content: 'Test message' }]
    });
    const description = 'Test custom status';
    
    const task = createTaskFromFunction(description, mockFunction);
    const result = await task.process();
    
    expect(result.status).toBe('waiting');
    expect(result.work).toBe('Custom work');
    expect(result.conversation).toEqual([{ role: 'user', content: 'Test message' }]);
  });
});

describe('TaskFunction type', () => {
  it('should accept functions that return Partial<DrakidionTask>', () => {
    const validFunction: TaskFunction = () => {
      return { work: 'Test work' };
    };
    
    expect(typeof validFunction).toBe('function');
  });
});
