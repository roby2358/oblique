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
let stopOrchestrator: (() => void) | undefined;

// State getters
export const getOrchestratorState = () => orchestratorState;
export const getLLMClient = () => llmClient;
export const getBlueskyClient = () => blueskyClient;
export const getStopOrchestrator = () => stopOrchestrator;

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
export const initializeOrchestrator = (config: any) => {
  // Stop existing orchestrator if running
  if (stopOrchestrator) {
    stopOrchestrator();
  }

  // Config is passed in as parameter
  const apiKey = config.openrouter?.apiKey;
  const model = config.openrouter?.model;
  const baseUrl = config.openrouter?.baseUrl;
  
  llmClient = apiKey ? createOpenRouterClient({
    apiKey,
    model,
    baseUrl,
  }) : undefined;

  // Create new orchestrator state
  orchestratorState = Orchestrator.createOrchestrator();

  // Initialize Bluesky client if configured
  const blueskyHandle = config.bluesky?.handle;
  const blueskyPassword = config.bluesky?.password;
  if (blueskyHandle && blueskyPassword) {
    blueskyClient = new BlueskyClient({
      handle: blueskyHandle,
      appPassword: blueskyPassword,
    });
  }

  // Start the orchestrator loop
  const result = Orchestrator.startLoop(orchestratorState, (updatedState) => {
    orchestratorState = updatedState;
    updateStatus();
  });
  
  orchestratorState = result.state;
  stopOrchestrator = result.stop;

  if (!llmClient) {
    addMessage('⚠️ No API key configured. Go to "Configure" to add your OpenRouter API key.', 'system');
  } else {
    addMessage('🔮 Oblique initialized. Type a message to receive an oblique response.', 'system');
  }
  
  addMessage('▶️ Orchestrator loop started', 'system');
  updateStatus();
};

