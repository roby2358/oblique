// Tests for Task Factories
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getConfig } from '../../src/config.js';
import { 
  newReadyTask,
  newWaitingTask,
} from '../../src/drakidion/task-factories.js';
import {
  createObliqueMessageTask,
} from '../../src/oblique-task-factory.js';
import type { LLMClient } from '../../src/hooks/llm/llm-client.js';

describe('Task Factories', () => {
  describe('newReadyTask', () => {
    it('should create a ready task with initial values and defaults', async () => {
      const task = {
        ...newReadyTask('Test task'),
        process: () => ({
          ...newReadyTask('Test task'),
          status: 'succeeded' as const,
          work: ['Completed'],
          doneAt: new Date(),
        }),
      };
      
      expect(task.status).toBe('ready');
      expect(task.description).toBe('Test task');
      expect(task.version).toBe(1);
      expect(task.taskId).toHaveLength(24);
      expect(task.createdAt).toBeInstanceOf(Date);
      expect(task.work).toEqual([]);
      
      const successor = task.process();
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toEqual(['Completed']);
    });

    it('should create unique task IDs', () => {
      const task1 = newReadyTask('Task 1');
      const task2 = newReadyTask('Task 2');
      
      expect(task1.taskId).not.toBe(task2.taskId);
    });

    it('should have different creation times', () => {
      const task1 = newReadyTask('Task 1');
      const task2 = newReadyTask('Task 2');
      
      expect(task1.createdAt!.getTime()).toBeLessThanOrEqual(task2.createdAt!.getTime());
    });
  });

  describe('newWaitingTask', () => {
    it('should create a waiting task with initial values', () => {
      const task = newWaitingTask('Waiting task');
      
      expect(task.status).toBe('waiting');
      expect(task.description).toBe('Waiting task');
      expect(task.version).toBe(1);
      expect(task.taskId).toHaveLength(24);
      expect(task.createdAt).toBeInstanceOf(Date);
      expect(task.work).toEqual([]);
    });

    it('should create unique task IDs', () => {
      const task1 = newWaitingTask('Waiting 1');
      const task2 = newWaitingTask('Waiting 2');
      
      expect(task1.taskId).not.toBe(task2.taskId);
    });
  });

  describe('createObliqueMessageTask', () => {
    beforeEach(() => {
      const config = getConfig();
      config.openrouter = {
        apiKey: 'sk-or-v1-test',
        models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5'],
        rotate: true,
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      };
    });

    // Mock LLM client
    const createMockLLMClient = (response?: string, shouldFail = false): LLMClient => {
      const generateResponse = async () => {
        if (shouldFail) {
          throw new Error('LLM API error');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          content: response || 'Mock LLM response',
          model: 'test-model',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        };
      };

      return {
        generateResponse,
        isConfigured: () => true,
      } as LLMClient;
    };

    it('should create a task with notification data', () => {
      const mockClient = createMockLLMClient();
      const onComplete = jest.fn();
      
      
      const task = createObliqueMessageTask(mockClient, [{ role: 'user', content: 'Test notification' }], onComplete);
      
      expect(task.status).toBe('waiting');
      expect(task.work).toEqual(['Waiting for LLM response...']);
      expect(task.conversation).toEqual([
        { role: 'user', content: 'Test notification' }
      ]);
    });
  });
});
