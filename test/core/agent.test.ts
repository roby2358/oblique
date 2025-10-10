import { describe, it, expect } from '@jest/globals';
import { Agent } from '../../src/core/agent.js';
import { createMemoryStorage } from '../../src/storage/memory-storage.js';
import type { LLMClient } from '../../src/hooks/llm/llm-client.js';
import type { Task } from '../../src/types/index.js';

describe('Agent', () => {
  const createMockLLMClient = (): LLMClient => ({
    async generateResponse(_request) {
      return {
        content: 'Oblique strategy: Use an old idea.',
        model: 'test-model',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      };
    },
    isConfigured: () => true,
  });

  it('should create an agent using static create method', async () => {
    const storage = createMemoryStorage();
    const agent = await Agent.create({ storage });

    expect(agent).toBeInstanceOf(Agent);
    expect(agent.getStatus().queueSize).toBe(0);
    expect(agent.getStatus().pendingTasks).toBe(0);
  });

  it('should process messages using class methods', async () => {
    const storage = createMemoryStorage();
    const llmClient = createMockLLMClient();
    const agent = await Agent.create({ storage, llmClient });

    const conversationId = agent.processMessage('user-1', 'Hello');

    expect(conversationId).toBeTruthy();
    expect(agent.getStatus().queueSize).toBe(1);
  });

  it('should support method chaining', async () => {
    const storage = createMemoryStorage();
    const llmClient = createMockLLMClient();
    const agent = await Agent.create({ storage, llmClient });

    const task: Task = {
      id: 'task-1',
      type: 'process_message',
      payload: { message: 'test' },
      createdAt: new Date(),
    };

    const result = agent.addTask(task);

    expect(result).toBe(agent); // Should return same instance for chaining
    expect(agent.getStatus().queueSize).toBe(1);
  });

  it('should process message and wait for response', async () => {
    const storage = createMemoryStorage();
    const llmClient = createMockLLMClient();
    const agent = await Agent.create({ storage, llmClient });

    const response = await agent.processMessageAndWait('user-1', 'Give me advice');

    expect(response).toBeTruthy();
    expect(response).toContain('Oblique');
  });

  it('should return error message when LLM not configured', async () => {
    const storage = createMemoryStorage();
    const agent = await Agent.create({ storage });

    const response = await agent.processMessageAndWait('user-1', 'Hello');

    expect(response).toContain('LLM not configured');
  });

  it('should handle LLM errors gracefully', async () => {
    const storage = createMemoryStorage();
    const errorClient: LLMClient = {
      async generateResponse() {
        throw new Error('Network error');
      },
      isConfigured: () => true,
    };
    
    const agent = await Agent.create({ storage, llmClient: errorClient });
    const response = await agent.processMessageAndWait('user-1', 'Hello');

    expect(response).toContain('Error');
    expect(response).toContain('Network error');
  });
});

