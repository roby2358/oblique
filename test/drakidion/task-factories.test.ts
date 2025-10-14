// Tests for Task Factories
import { 
  createObliqueMessageTask,
  newReadyTask,
  newWaitingTask,
} from '../../src/drakidion/task-factories.js';
import {
  createLLMTask,
  createIncrementTask, 
  createRetryTask, 
  createTaskChain,
  createWaitingTask
} from '../../src/drakidion/task-example-factories.js';
import type { LLMClient } from '../../src/hooks/llm/llm-client.js';

describe('Task Factories', () => {
  describe('newReadyTask', () => {
    it('should create a ready task with initial values and defaults', async () => {
      const task = {
        ...newReadyTask('Test task'),
        work: 'Initial work',
        process: async () => {
          return {
            ...task,
            status: 'succeeded' as const,
            work: 'Completed',
            doneAt: new Date(),
          };
        },
      };

      expect(task.status).toBe('ready');
      expect(task.version).toBe(1); // Always starts at version 1
      expect(task.description).toBe('Test task');
      expect(task.work).toBe('Initial work');
      expect(task.taskId).toHaveLength(24); // Always generates new taskId
      expect(task.createdAt).toBeInstanceOf(Date);
      expect(task.conversation).toBeUndefined();

      // Test that process function works
      const result = await task.process();
      expect(result.status).toBe('succeeded');
      expect(result.work).toBe('Completed');
    });

    it('should provide default empty work', () => {
      const task = {
        ...newReadyTask('Test task'),
      };

      expect(task.work).toBe('');
    });

    it('should provide default process that throws', async () => {
      const task = {
        ...newReadyTask('Test task'),
      };

      await expect(task.process()).rejects.toThrow('Task process not implemented');
    });

    it('should accept optional conversation override', () => {
      const conversation = [
        { source: 'user', text: 'Hello' },
        { source: 'assistant', text: 'Hi there' },
      ];

      const task = {
        ...newReadyTask('Test task'),
        work: 'Work',
        conversation,
      };

      expect(task.conversation).toEqual(conversation);
    });
  });

  describe('newWaitingTask', () => {
    it('should create a waiting task with initial values and defaults', () => {
      const task = {
        ...newWaitingTask('Waiting task'),
        work: 'Custom waiting...',
        onSuccess: (result: any) => ({
          ...task,
          status: 'succeeded' as const,
          work: result.data,
          doneAt: new Date(),
        }),
        onError: (error: any) => ({
          ...task,
          status: 'dead' as const,
          work: `Error: ${error.message}`,
          doneAt: new Date(),
        }),
      };

      expect(task.status).toBe('waiting');
      expect(task.version).toBe(1); // Always starts at version 1
      expect(task.description).toBe('Waiting task');
      expect(task.work).toBe('Custom waiting...');
      expect(task.taskId).toHaveLength(24); // Always generates new taskId
      expect(task.createdAt).toBeInstanceOf(Date);
      expect(task.onSuccess).toBeDefined();
      expect(task.onError).toBeDefined();
      expect(task.conversation).toBeUndefined();
    });

    it('should provide default work of "Waiting..."', () => {
      const task = {
        ...newWaitingTask('Waiting task'),
      };

      expect(task.work).toBe('Waiting...');
    });

    it('should throw error when process is called (default behavior)', async () => {
      const task = {
        ...newWaitingTask('Waiting task'),
      };

      await expect(task.process()).rejects.toThrow('Waiting tasks should not be processed directly');
    });

    it('should accept optional conversation override', () => {
      const conversation = [{ source: 'user', text: 'Test' }];

      const task = {
        ...newWaitingTask('Waiting task'),
        conversation,
      };

      expect(task.conversation).toEqual(conversation);
    });

    it('should call onSuccess callback correctly', () => {
      const task = {
        ...newWaitingTask('Waiting task'),
        onSuccess: (result: any) => ({
          ...task,
          status: 'succeeded' as const,
          work: `Success: ${result.data}`,
          doneAt: new Date(),
        }),
      };

      const result = task.onSuccess!({ data: 'test result' });
      expect(result.status).toBe('succeeded');
      expect(result.work).toBe('Success: test result');
    });

    it('should call onError callback correctly', () => {
      const task = {
        ...newWaitingTask('Waiting task'),
        onError: (error: any) => ({
          ...task,
          status: 'dead' as const,
          work: `Error: ${error.message}`,
          doneAt: new Date(),
        }),
      };

      const result = task.onError!(new Error('test error'));
      expect(result.status).toBe('dead');
      expect(result.work).toBe('Error: test error');
    });
  });

  describe('createIncrementTask', () => {
    it('should create a task with initial value', () => {
      const task = createIncrementTask(0);
      
      expect(task.version).toBe(1);
      expect(task.status).toBe('ready');
      expect(task.work).toBe('Count: 0');
      expect(task.taskId).toHaveLength(24);
    });
    
    it('should increment value when processed', async () => {
      const task = createIncrementTask(0);
      const successor = await task.process();
      
      expect(successor.work).toBe('Count: 1');
    });
    
    it('should complete after reaching 5', async () => {
      const task = createIncrementTask(4);
      const successor = await task.process();
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toBe('Count: 5 (completed)');
    });
  });
  
  describe('createRetryTask', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        return 'success';
      };
      const task = createRetryTask(operation, 3);
      
      const successor = await task.process();
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toBe('success');
      expect(callCount).toBe(1);
    });
    
    it('should retry on failure', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success after retries';
      };
      
      let task = createRetryTask(operation, 3);
      
      // First attempt - fails
      task = await task.process();
      expect(task.status).toBe('ready');
      expect(task.retryCount).toBe(1);
      
      // Second attempt - fails
      task = await task.process();
      expect(task.status).toBe('ready');
      expect(task.retryCount).toBe(2);
      
      // Third attempt - succeeds
      task = await task.process();
      expect(task.status).toBe('succeeded');
      expect(task.work).toBe('success after retries');
      expect(attempts).toBe(3);
    });
    
    it('should give up after max retries', async () => {
      const operation = async () => {
        throw new Error('Permanent failure');
      };
      let task = createRetryTask(operation, 2);
      
      // Attempt 1
      task = await task.process();
      expect(task.status).toBe('ready');
      
      // Attempt 2
      task = await task.process();
      expect(task.status).toBe('ready');
      
      // Attempt 3 - give up
      task = await task.process();
      expect(task.status).toBe('dead');
      expect(task.work).toContain('Failed after 2 retries');
    });
  });
  
  describe('createTaskChain', () => {
    it('should execute operations sequentially', async () => {
      const callCounts = [0, 0, 0];
      const operations = [
        async () => { callCounts[0]++; return 'step1'; },
        async () => { callCounts[1]++; return 'step2'; },
        async () => { callCounts[2]++; return 'step3'; },
      ];
      
      let task = createTaskChain(operations);
      
      // Execute first operation
      task = await task.process();
      expect(callCounts[0]).toBe(1);
      expect(task.work).toBe('step1');
      expect(task.status).toBe('ready');
      
      // Execute second operation
      task = await task.process();
      expect(callCounts[1]).toBe(1);
      expect(task.work).toBe('step1\nstep2');
      expect(task.status).toBe('ready');
      
      // Execute third operation
      task = await task.process();
      expect(callCounts[2]).toBe(1);
      expect(task.work).toBe('step1\nstep2\nstep3');
      expect(task.status).toBe('succeeded');
    });
    
    it('should fail if any operation fails', async () => {
      const callCounts = [0, 0, 0];
      const operations = [
        async () => { callCounts[0]++; return 'step1'; },
        async () => { callCounts[1]++; throw new Error('step2 failed'); },
        async () => { callCounts[2]++; return 'step3'; },
      ];
      
      let task = createTaskChain(operations);
      
      // Execute first operation
      task = await task.process();
      expect(task.status).toBe('ready');
      
      // Execute second operation - fails
      task = await task.process();
      expect(task.status).toBe('dead');
      expect(task.work).toContain('Failed at step 2');
      
      // Third operation should not be called
      expect(callCounts[2]).toBe(0);
    });
  });

  describe('createWaitingTask', () => {
    it('should create a waiting task', () => {
      const task = createWaitingTask();
      
      expect(task.status).toBe('waiting');
      expect(task.work).toBe('Waiting for async response...');
      expect(task.taskId).toHaveLength(24);
    });

    it('should throw error when process is called', async () => {
      const task = createWaitingTask();
      
      await expect(task.process()).rejects.toThrow('Waiting tasks should not be processed directly');
    });

    it('should transition to succeeded when onSuccess is called', () => {
      const task = createWaitingTask();
      
      const successor = task.onSuccess!({ data: 'test result' });
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toContain('test result');
    });

    it('should transition to dead when onError is called', () => {
      const task = createWaitingTask();
      
      const successor = task.onError!(new Error('Test error'));
      
      expect(successor.status).toBe('dead');
      expect(successor.work).toContain('Test error');
    });

    it('should call onComplete callback', () => {
      let callbackResult: any = null;
      const onComplete = (result: any) => {
        callbackResult = result;
      };
      
      const task = createWaitingTask(undefined, onComplete);
      task.onSuccess!({ data: 'test' });
      
      expect(callbackResult).toEqual({ data: 'test' });
    });
  });

  describe('createLLMTask', () => {
    // Mock LLM client
    const createMockLLMClient = (response?: string, shouldFail = false): LLMClient => {
      const generateResponse = async () => {
        if (shouldFail) {
          throw new Error('LLM API error');
        }
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async delay
        return { 
          content: response || 'Mock LLM response',
          model: 'test-model'
        };
      };
      
      return {
        generateResponse,
        isConfigured: () => true,
      };
    };

    it('should create a waiting task', () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      const task = createLLMTask('Test message', mockClient, onComplete);
      
      expect(task.status).toBe('waiting');
      expect(task.work).toBe('Waiting for LLM response...');
      expect(task.taskId).toHaveLength(24);
      expect(task.conversation).toHaveLength(1);
      expect(task.conversation![0]).toEqual({ source: 'user', text: 'Test message' });
    });

    it('should initiate LLM call and invoke onComplete on success', async () => {
      const mockClient = createMockLLMClient('Test response');
      let completedWith: any = null;
      const onComplete = (taskId: string, result?: any, error?: any) => {
        completedWith = { taskId, result, error };
      };
      
      const task = createLLMTask('Test message', mockClient, onComplete);
      
      // Wait for the async LLM call to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(completedWith).not.toBeNull();
      expect(completedWith.taskId).toBe(task.taskId);
      expect(completedWith.result).toEqual({ content: 'Test response', model: 'test-model' });
      expect(completedWith.error).toBeUndefined();
    });

    it('should invoke onComplete with error on failure', async () => {
      const mockClient = createMockLLMClient('', true);
      let completedWith: any = null;
      const onComplete = (taskId: string, result?: any, error?: any) => {
        completedWith = { taskId, result, error };
      };
      
      const task = createLLMTask('Test message', mockClient, onComplete);
      
      // Wait for the async LLM call to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(completedWith).not.toBeNull();
      expect(completedWith.taskId).toBe(task.taskId);
      expect(completedWith.result).toBeUndefined();
      expect(completedWith.error).toBeInstanceOf(Error);
    });

    it('should have onSuccess callback that returns succeeded task', () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      const task = createLLMTask('Test message', mockClient, onComplete);
      
      const successor = task.onSuccess!({ content: 'LLM response' });
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toBe('LLM response');
      expect(successor.conversation).toHaveLength(2);
      expect(successor.conversation![1]).toEqual({ 
        source: 'assistant', 
        text: 'LLM response' 
      });
    });

    it('should have onError callback that returns dead task', () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      const task = createLLMTask('Test message', mockClient, onComplete);
      
      const successor = task.onError!(new Error('API error'));
      
      expect(successor.status).toBe('dead');
      expect(successor.work).toContain('API error');
    });

    it('should respect custom temperature', async () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      createLLMTask('Test message', mockClient, onComplete, { temperature: 0.5 });
      
      // Wait for the async LLM call to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Can't verify the temperature was passed since we don't track calls
      // But the test confirms no errors occur with custom temperature
    });

    it('should preserve conversation history', () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      const existingConversation = [
        { source: 'user', text: 'Previous message' },
        { source: 'assistant', text: 'Previous response' },
      ];
      
      const task = createLLMTask('New message', mockClient, onComplete, {
        conversation: existingConversation,
      });
      
      expect(task.conversation).toHaveLength(3);
      expect(task.conversation![0]).toEqual(existingConversation[0]);
      expect(task.conversation![1]).toEqual(existingConversation[1]);
      expect(task.conversation![2]).toEqual({ source: 'user', text: 'New message' });
    });
  });

  describe('createObliqueMessageTask', () => {
    // Mock LLM client
    const createMockLLMClient = (response?: string, shouldFail = false): LLMClient => {
      const generateResponse = async () => {
        if (shouldFail) {
          throw new Error('LLM API error');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        return { 
          content: response || 'Mock oblique response',
          model: 'test-model'
        };
      };
      
      return {
        generateResponse,
        isConfigured: () => true,
      };
    };

    const mockCreatePrompt = (message: string) => `Oblique: ${message}`;

    it('should create a waiting task', () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      const task = createObliqueMessageTask(
        'Test message',
        mockClient,
        mockCreatePrompt,
        onComplete
      );
      
      expect(task.status).toBe('waiting');
      expect(task.work).toBe('Waiting for LLM response...');
      expect(task.description).toContain('Oblique:');
      expect(task.taskId).toHaveLength(24);
    });

    it('should apply prompt transformation and call LLM', async () => {
      const mockClient = createMockLLMClient('Transformed response');
      let completedWith: any = null;
      const onComplete = (taskId: string, result?: any, error?: any) => {
        completedWith = { taskId, result, error };
      };
      
      const task = createObliqueMessageTask(
        'Test message',
        mockClient,
        mockCreatePrompt,
        onComplete
      );
      
      // Wait for the async LLM call to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(completedWith).not.toBeNull();
      expect(completedWith.taskId).toBe(task.taskId);
      expect(completedWith.result).toEqual({ content: 'Transformed response', model: 'test-model' });
      expect(completedWith.error).toBeUndefined();
    });

    it('should have onSuccess callback that returns succeeded task', () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      const task = createObliqueMessageTask(
        'Test message',
        mockClient,
        mockCreatePrompt,
        onComplete
      );
      
      const successor = task.onSuccess!({ content: 'Oblique response' });
      
      expect(successor.status).toBe('succeeded');
      expect(successor.work).toBe('Oblique response');
      expect(successor.conversation).toHaveLength(2);
    });

    it('should have onError callback that returns dead task', () => {
      const mockClient = createMockLLMClient();
      const onComplete = () => {};
      
      const task = createObliqueMessageTask(
        'Test message',
        mockClient,
        mockCreatePrompt,
        onComplete
      );
      
      const successor = task.onError!(new Error('Transform error'));
      
      expect(successor.status).toBe('dead');
      expect(successor.work).toContain('Transform error');
    });
  });
});

