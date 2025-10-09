#!/usr/bin/env node

// CLI interface
import { config as loadEnv } from 'dotenv';
import * as readline from 'readline';
import { createAgent, processMessage, getAgentStatus } from './core/agent.js';
import { createMemoryStorage } from './storage/memory-storage.js';
import { createOpenRouterClient } from './hooks/llm/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';

loadEnv();

const tryOpenRouter = (): LLMClient | undefined => {
  if (!process.env.OPENROUTER_API_KEY) return undefined;
  
  console.log('Using OpenRouter LLM');
  return createOpenRouterClient({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions',
  });
};

const createLLMClient = (): LLMClient | undefined => {
  return tryOpenRouter() 
    || (console.warn('No LLM API key configured. Set an API_KEY value in .env'), undefined);
};

const main = async () => {
  console.log('🔮 Oblique - The Tangential Bot\n');

  const storage = createMemoryStorage();
  const llmClient = createLLMClient();

  const agent = await createAgent({
    storage,
    llmClient,
    autoSave: true,
  });

  console.log('Agent initialized.');
  console.log('Type your messages and receive oblique responses.');
  console.log('Commands: /status, /quit\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentAgent = agent;
  const userId = 'cli-user';

  const prompt = () => {
    rl.question('You: ', async (input) => {
      const message = input.trim();

      if (!message) {
        prompt();
        return;
      }

      if (message === '/quit') {
        console.log('\nGoodbye!');
        rl.close();
        return;
      }

      if (message === '/status') {
        const status = getAgentStatus(currentAgent);
        console.log(`\nStatus: Queue=${status.queueSize}, Pending=${status.pendingTasks}, Users=${status.activeUsers}\n`);
        prompt();
        return;
      }

      try {
        const [response, newAgent] = await processMessage(currentAgent, userId, message);
        currentAgent = newAgent;
        console.log(`\nOblique: ${response}\n`);
      } catch (error) {
        console.error('Error:', error);
      }

      prompt();
    });
  };

  prompt();
};

main().catch(console.error);

