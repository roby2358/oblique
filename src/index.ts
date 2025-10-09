// Browser entry point
import { createAgent, processMessage, getAgentStatus } from './core/agent.js';
import { createMemoryStorage } from './storage/memory-storage.js';
import { createOpenRouterClient } from './hooks/llm/index.js';
import type { Agent } from './core/agent.js';

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

// DOM elements
const chatMessages = document.getElementById('chat-messages') as HTMLDivElement;
const messageInput = document.getElementById('message-input') as HTMLInputElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const statusDisplay = document.getElementById('status') as HTMLDivElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const configureButton = document.getElementById('configure-button') as HTMLButtonElement;
const configPanel = document.getElementById('config-panel') as HTMLDivElement;

const addMessage = (text: string, sender: 'user' | 'oblique' | 'system') => {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message`;
  
  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = sender === 'user' ? 'You' : sender === 'oblique' ? 'Oblique' : 'System';
  
  const content = document.createElement('span');
  content.className = 'message-content';
  content.textContent = text;
  
  messageDiv.appendChild(label);
  messageDiv.appendChild(content);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

const updateStatus = () => {
  if (!agent) {
    statusDisplay.textContent = 'Not initialized';
    return;
  }
  const status = getAgentStatus(agent);
  statusDisplay.textContent = `Queue: ${status.queueSize} | Pending: ${status.pendingTasks} | Users: ${status.activeUsers}`;
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
  const message = messageInput.value.trim();
  if (!message) return;

  messageInput.value = '';
  messageInput.disabled = true;
  sendButton.disabled = true;

  addMessage(message, 'user');

  try {
    const [response, newAgent] = await processMessage(agent, userId, message);
    agent = newAgent;
    addMessage(response, 'oblique');
    updateStatus();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addMessage(`Error: ${errorMsg}`, 'system');
  }

  messageInput.disabled = false;
  sendButton.disabled = false;
  messageInput.focus();
};

const handleConfigure = () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || 'anthropic/claude-3.5-haiku';

  if (apiKey) {
    localStorage.setItem('openrouter_api_key', apiKey);
    localStorage.setItem('openrouter_model', model);
    addMessage('✅ Configuration saved. Reinitializing agent...', 'system');
    initializeAgent();
  }
};

// Event listeners
sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

configureButton.addEventListener('click', () => {
  configPanel.classList.toggle('hidden');
});

document.getElementById('save-config')?.addEventListener('click', handleConfigure);

// Load configuration and initialize
const startup = async () => {
  config = await loadConfig();
  
  // Load saved config into inputs (prioritize config.json over localStorage)
  apiKeyInput.value = config.openrouter?.apiKey 
    || localStorage.getItem('openrouter_api_key') 
    || '';
  modelInput.value = config.openrouter?.model 
    || localStorage.getItem('openrouter_model') 
    || 'anthropic/claude-3.5-haiku';
  
  await initializeAgent();
};

startup();

