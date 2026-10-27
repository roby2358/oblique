// Shared panel support functions and state management
import * as Orchestrator from './drakidion/orchestrator.js';
import type { OrchestratorState } from './drakidion/drakidion-types.js';
import { createOpenRouterClient } from './hooks/llm/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import { createOpenRouterJevClient } from './hooks/jev/index.js';
import type { JevClient } from './hooks/jev/jev-client.js';
import { createAccounts } from './bluesky-accounts.js';
import type { BlueskyAccount } from './bluesky-accounts.js';

declare const $: any;

// Shared state
let orchestratorState: OrchestratorState;
let llmClient: LLMClient | undefined;
let jevClient: JevClient | undefined;
let blueskyAccounts: BlueskyAccount[] = [];
let stopOrchestrator: (() => void) | undefined;

// State getters
export const getOrchestratorState = () => orchestratorState;
export const getLLMClient = () => llmClient;
export const getJevClient = () => jevClient;
export const getBlueskyAccounts = () => blueskyAccounts;
export const getStopOrchestrator = () => stopOrchestrator;

// State setters
export const setOrchestratorState = (state: OrchestratorState) => {
  orchestratorState = state;
};
export const setLLMClient = (client: LLMClient | undefined) => {
  llmClient = client;
};
export const setBlueskyAccounts = (accounts: BlueskyAccount[]) => {
  blueskyAccounts = accounts;
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
  const baseUrl = config.openrouter?.baseUrl;
  
  llmClient = apiKey ? createOpenRouterClient({
    apiKey,
    baseUrl,
  }) : undefined;

  // Jev is reached through the same OpenRouter account and the same key, at a different
  // endpoint: it answers typed questions, not chat completions (D-27). Without a `jev` block
  // there is no client, and every reply draws its register from the lenses as it used to.
  const jev = config.jev;

  jevClient = apiKey && jev?.model && jev?.baseUrl ? createOpenRouterJevClient({
    apiKey,
    baseUrl: jev.baseUrl,
    model: jev.model,
  }) : undefined;

  // Create new orchestrator state
  orchestratorState = Orchestrator.createOrchestrator();

  // Sign in to every account config.json configures; they all feed the one queue (D-22)
  blueskyAccounts = createAccounts(config);

  // Start the orchestrator loop
  const result = Orchestrator.startLoop(orchestratorState, (updatedState) => {
    orchestratorState = updatedState;
    updateStatus();
  });
  
  orchestratorState = result.state;
  stopOrchestrator = result.stop;

  if (!llmClient) {
    addMessage('⚠️ No API key configured. Set openrouter.apiKey in config.json and reload; see the "Configure" panel.', 'system');
  } else {
    addMessage('🔮 Oblique initialized. Type a message to receive an oblique response.', 'system');
  }
  
  if (!jevClient) {
    addMessage('🎲 No Jev configured. Every reply draws its register from the four lenses; set a `jev` block in config.json to have Jev choose.', 'system');
  }

  if (blueskyAccounts.length === 0) {
    addMessage('⚠️ No Bluesky account configured. Set a handle, password and service in config.json and reload.', 'system');
  } else {
    const handles = blueskyAccounts.map(account => `@${account.handle}`).join(', ');
    addMessage(`🦋 Polling as ${handles}`, 'system');
  }

  addMessage('▶️ Orchestrator loop started', 'system');
  updateStatus();
};

