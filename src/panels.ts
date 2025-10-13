// Shared panel support functions and state management
import * as Orchestrator from './drakidion/orchestrator.js';
import type { OrchestratorState } from './drakidion/drakidion-types.js';
import { createOpenRouterClient } from './hooks/llm/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import { BlueskyClient } from './hooks/bluesky/bluesky-client.js';

declare const $: any;

// Configuration interface
export interface Config {
  openrouter?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  bluesky?: {
    handle?: string;
    password?: string;
  };
}

// Shared state
let orchestratorState: OrchestratorState;
let llmClient: LLMClient | undefined;
let blueskyClient: BlueskyClient | undefined;
let config: Config = {};

// State getters
export const getOrchestratorState = () => orchestratorState;
export const getLLMClient = () => llmClient;
export const getBlueskyClient = () => blueskyClient;
export const getConfig = () => config;

// State setters
export const setOrchestratorState = (state: OrchestratorState) => {
  orchestratorState = state;
};
export const setLLMClient = (client: LLMClient | undefined) => {
  llmClient = client;
};
export const setBlueskyClient = (client: BlueskyClient | undefined) => {
  blueskyClient = client;
};
export const setConfig = (newConfig: Config) => {
  config = newConfig;
};

// Load configuration from config.json
export const loadConfig = async (): Promise<Config> => {
  try {
    const response = await fetch('/config.json');
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Could not load config.json, using defaults');
  }
  return {};
};

// Add a message to the chat
export const addMessage = (text: string, sender: 'user' | 'oblique' | 'system') => {
  const senderLabel = sender === 'user' ? 'You' : sender === 'oblique' ? 'Oblique' : 'System';
  
  const $messageDiv = $('<div>')
    .addClass('message')
    .addClass(`${sender}-message`);
  
  const $label = $('<span>')
    .addClass('message-label')
    .text(senderLabel);
  
  const $content = $('<span>')
    .addClass('message-content')
    .text(text);
  
  $messageDiv.append($label).append($content);
  $('#chat-messages').append($messageDiv);
  
  const chatMessages = $('#chat-messages')[0];
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

// Update the status display
export const updateStatus = () => {
  if (!orchestratorState) {
    $('#status').text('Not initialized');
    return;
  }
  const status = Orchestrator.getStatus(orchestratorState);
  $('#status').text(`Queue: ${status.queueSize} | Waiting: ${status.waitingSize}`);
};

// Initialize the orchestrator
export const initializeOrchestrator = () => {
  // Priority: config.json -> localStorage -> defaults
  const apiKey = config.openrouter?.apiKey 
    || localStorage.getItem('openrouter_api_key') 
    || '';
  const model = config.openrouter?.model 
    || localStorage.getItem('openrouter_model') 
    || 'anthropic/claude-3.5-haiku';
  const baseUrl = config.openrouter?.baseUrl 
    || 'https://openrouter.ai/api/v1/chat/completions';
  
  llmClient = apiKey ? createOpenRouterClient({
    apiKey,
    model,
    baseUrl,
  }) : undefined;

  // Create new orchestrator state
  orchestratorState = Orchestrator.createOrchestrator();

  // Initialize Bluesky client if configured
  const blueskyHandle = config.bluesky?.handle || '';
  const blueskyPassword = config.bluesky?.password || '';
  if (blueskyHandle && blueskyPassword) {
    blueskyClient = new BlueskyClient({
      handle: blueskyHandle,
      appPassword: blueskyPassword,
    });
  }

  if (!llmClient) {
    addMessage('⚠️ No API key configured. Go to "Configure" to add your OpenRouter API key.', 'system');
  } else {
    addMessage('🔮 Oblique initialized. Type a message to receive an oblique response.', 'system');
  }
  
  updateStatus();
};

