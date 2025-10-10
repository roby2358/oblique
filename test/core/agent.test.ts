import { describe, it, expect, jest } from '@jest/globals';
import { 
  createAgent, 
  processMessage, 
  processMessageAndWait,
  processAllTasks,
  getAgentStatus, 
  addTask 
} from '../../src/core/agent.js';
import { createMemoryStorage } from '../../src/storage/memory-storage.js';
import type { LLMClient } from '../../src/hooks/llm/llm-client.js';
import type { Task } from '../../src/types/index.js';

describe('Agent', () => {
  const createMockLLMClient = (): LLMClient => ({
    async generateResponse(request) {
      return {
        content: 'A river remembers the mountains it once climbed.',
        model: 'test-model',
        usage: {
          promptTokens: 10,
          completionTokens: 8,
          totalTokens: 18,
        },
      };
    },
    isConfigured: () => true,
  });

  describe('createAgent', () => {
    it('should create a new agent', async () => {
      const storage = createMemoryStorage();
      const agent = await createAgent({ storage });

      expect(agent).toBeDefined();
      expect(agent.queue).toBeDefined();
      expect(agent.pendingMap).toBeDefined();
    });

    it('should load existing state from storage', async () => {
      const storage = createMemoryStorage();
      const agent1 = await createAgent({ storage });
      
      // Modify and save state
      await storage.save({
        queue: agent1.queue,
        pendingMap: agent1.pendingMap,
      });

      // Create new agent - should load saved state
      const agent2 = await createAgent({ storage });
      
      expect(agent2.queue).toEqual(agent1.queue);
      expect(agent2.pendingMap).toEqual(agent1.pendingMap);
    });
  });

  describe('processMessage', () => {
    it('should create a task and add to queue', async () => {
      const storage = createMemoryStorage();
      const llmClient = createMockLLMClient();
      const agent = await createAgent({ storage, llmClient });

      const [conversationId, newAgent] = processMessage(agent, 'user-1', 'Hello');

      expect(conversationId).toBeTruthy();
      expect(typeof conversationId).toBe('string');
      const status = getAgentStatus(newAgent);
      expect(status.queueSize).toBe(1);
    });

    it('should process message and return response when using processMessageAndWait', async () => {
      const storage = createMemoryStorage();
      const llmClient = createMockLLMClient();
      const agent = await createAgent({ storage, llmClient });

      const [response, newAgent] = await processMessageAndWait(agent, 'user-1', 'Hello');

      expect(response).toBeTruthy();
      expect(response).toContain('river');
      expect(newAgent).toBeDefined();
    });

    it('should return error message when LLM not configured', async () => {
      const storage = createMemoryStorage();
      const agent = await createAgent({ storage });

      const [response] = await processMessageAndWait(agent, 'user-1', 'Hello');

      expect(response).toContain('LLM not configured');
    });

    it('should handle LLM errors gracefully', async () => {
      const storage = createMemoryStorage();
      const errorClient: LLMClient = {
        async generateResponse() {
          throw new Error('API Error');
        },
        isConfigured: () => true,
      };
      
      const agent = await createAgent({ storage, llmClient: errorClient });
      const [response] = await processMessageAndWait(agent, 'user-1', 'Hello');

      expect(response).toContain('Error');
      expect(response).toContain('API Error');
    });
  });

  describe('addTask', () => {
    it('should add a task to the queue', async () => {
      const storage = createMemoryStorage();
      const agent = await createAgent({ storage });

      const task: Task = {
        id: 'task-1',
        type: 'process_message',
        payload: { message: 'test' },
        createdAt: new Date(),
      };

      const newAgent = addTask(agent, task);
      const status = getAgentStatus(newAgent);

      expect(status.queueSize).toBe(1);
    });
  });

  describe('getAgentStatus', () => {
    it('should return agent status', async () => {
      const storage = createMemoryStorage();
      const agent = await createAgent({ storage });

      const status = getAgentStatus(agent);

      expect(status).toHaveProperty('queueSize');
      expect(status).toHaveProperty('pendingTasks');
      expect(status.queueSize).toBe(0);
      expect(status.pendingTasks).toBe(0);
    });
  });
});

