// Browser entry point
import { createAgent, processMessageAndWait, getAgentStatus } from './core/agent.js';
import { createMemoryStorage } from './storage/memory-storage.js';
import { createOpenRouterClient } from './hooks/llm/index.js';
import type { Agent } from './core/agent.js';

// jQuery is loaded via CDN in index.html
// Note: Run 'npm install' to get jQuery type definitions from @types/jquery
declare const $: any;

interface Config {
  openrouter?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

let agent: Agent;
let config: Config = {};
const userId = 'browser-user';

const addMessage = (text: string, sender: 'user' | 'oblique' | 'system') => {
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

const updateStatus = () => {
  if (!agent) {
    $('#status').text('Not initialized');
    return;
  }
  const status = getAgentStatus(agent);
  $('#status').text(`Queue: ${status.queueSize} | Pending: ${status.pendingTasks}`);
};

const loadConfig = async (): Promise<Config> => {
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

const initializeAgent = async () => {
  // Priority: config.json -> localStorage -> defaults
  const apiKey = config.openrouter?.apiKey 
    || localStorage.getItem('openrouter_api_key') 
    || '';
  const model = config.openrouter?.model 
    || localStorage.getItem('openrouter_model') 
    || 'anthropic/claude-3.5-haiku';
  const baseUrl = config.openrouter?.baseUrl 
    || 'https://openrouter.ai/api/v1/chat/completions';
  
  const storage = createMemoryStorage();
  const llmClient = apiKey ? createOpenRouterClient({
    apiKey,
    model,
    baseUrl,
  }) : undefined;

  agent = await createAgent({
    storage,
    llmClient,
    autoSave: true,
  });

  if (!llmClient) {
    addMessage('⚠️ No API key configured. Click "Configure" to add your OpenRouter API key.', 'system');
  } else {
    addMessage('🔮 Oblique initialized. Type a message to receive an oblique response.', 'system');
  }
  
  updateStatus();
};

const handleSendMessage = async () => {
  const $messageInput = $('#message-input');
  const message = ($messageInput.val() as string).trim();
  if (!message) return;

  $messageInput.val('');
  $messageInput.prop('disabled', true);
  $('#send-button').prop('disabled', true);

  addMessage(message, 'user');

  try {
    const [response, newAgent] = await processMessageAndWait(agent, userId, message);
    agent = newAgent;
    addMessage(response, 'oblique');
    updateStatus();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addMessage(`Error: ${errorMsg}`, 'system');
  }

  $messageInput.prop('disabled', false);
  $('#send-button').prop('disabled', false);
  $messageInput.focus();
};

const handleConfigure = () => {
  const apiKey = ($('#api-key').val() as string).trim();
  const model = ($('#model').val() as string).trim() || 'anthropic/claude-3.5-haiku';

  if (apiKey) {
    localStorage.setItem('openrouter_api_key', apiKey);
    localStorage.setItem('openrouter_model', model);
    addMessage('✅ Configuration saved. Reinitializing agent...', 'system');
    initializeAgent();
  }
};

// Load configuration and initialize
const startup = async () => {
  config = await loadConfig();
  
  // Load saved config into inputs (prioritize config.json over localStorage)
  $('#api-key').val(
    config.openrouter?.apiKey 
    || localStorage.getItem('openrouter_api_key') 
    || ''
  );
  $('#model').val(
    config.openrouter?.model 
    || localStorage.getItem('openrouter_model') 
    || 'anthropic/claude-3.5-haiku'
  );
  
  await initializeAgent();
};

// jQuery document ready
$(document).ready(() => {
  // Event listeners
  $('#send-button').on('click', handleSendMessage);
  
  $('#message-input').on('keypress', (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  $('#configure-button').on('click', () => {
    $('#config-panel').toggleClass('hidden');
  });

  $('#save-config').on('click', handleConfigure);

  // Initialize
  startup();
});

