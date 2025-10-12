// Browser entry point
import * as Orchestrator from './core/orchestrator.js';
import * as TaskMapOps from './core/task-map.js';
import * as TaskFactories from './core/task-factories.js';
import type { OrchestratorState } from './core/drakidion-types.js';
import { createOpenRouterClient } from './hooks/llm/index.js';
import type { LLMClient } from './hooks/llm/llm-client.js';
import { createBlueskyClient, type BlueskyClient } from './hooks/bluesky/bluesky-client.js';
import type { BlueskyMessage } from './types/index.js';
import { createObliquePrompt } from './prompts/oblique.js';
import { updateObserverPanel } from './orchestratorPanel.js';

// jQuery is loaded via CDN in index.html
// Note: Run 'npm install' to get jQuery type definitions from @types/jquery
declare const $: any;

interface Config {
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

let orchestratorState: OrchestratorState;
let llmClient: LLMClient | undefined;
let blueskyClient: BlueskyClient | undefined;
let config: Config = {};

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
  if (!orchestratorState) {
    $('#status').text('Not initialized');
    return;
  }
  const status = Orchestrator.getStatus(orchestratorState);
  $('#status').text(`Queue: ${status.queueSize} | Waiting: ${status.waitingSize}`);
};


const handleConfigure = () => {
  const apiKey = ($('#api-key').val() as string).trim();
  const model = ($('#model').val() as string).trim() || 'anthropic/claude-3.5-haiku';

  if (apiKey) {
    localStorage.setItem('openrouter_api_key', apiKey);
    localStorage.setItem('openrouter_model', model);
    addMessage('✅ Configuration saved. Reinitializing orchestrator...', 'system');
    initializeOrchestrator();
  }
};

const initializeOrchestrator = () => {
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
    blueskyClient = createBlueskyClient({
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

const handleSendMessage = async () => {
  const $messageInput = $('#message-input');
  const message = ($messageInput.val() as string).trim();
  if (!message) return;

  $messageInput.val('');
  $messageInput.prop('disabled', true);
  $('#send-button').prop('disabled', true);

  addMessage(message, 'user');

  try {
    if (!llmClient) {
      addMessage('⚠️ LLM client not configured', 'system');
      $messageInput.prop('disabled', false);
      $('#send-button').prop('disabled', false);
      $messageInput.focus();
      return;
    }

    // Create task for processing the message
    const task = TaskFactories.createObliqueMessageTask(
      message,
      llmClient,
      createObliquePrompt
    );

    // Add task to orchestrator
    orchestratorState = Orchestrator.addTask(orchestratorState, task);

    // Process all tasks
    orchestratorState = await Orchestrator.processAllTasks(orchestratorState);

    // Get the completed task and extract response
    const completedTask = TaskMapOps.getTask(orchestratorState.taskMap, task.taskId);
    const response = completedTask?.work || '[No response received]';

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

const handleCheckBluesky = async () => {
  if (!blueskyClient) {
    $('#bluesky-posts').html('<p class="error">Bluesky not configured. Please add credentials to config.json</p>');
    return;
  }

  $('#check-bluesky').prop('disabled', true).text('Checking...');
  $('#bluesky-posts').html('<p>Loading notifications...</p>');

  try {
    // Authenticate if not already
    if (!blueskyClient.isAuthenticated()) {
      await blueskyClient.authenticate();
    }

    // Get unread notifications only (unreadOnly = true by default)
    const notifications = await blueskyClient.getNotifications(25, true);

    // Display notifications
    if (notifications.length === 0) {
      $('#bluesky-posts').html('<p>No new notifications.</p>');
    } else {
      const postsHtml = notifications.map((notif: BlueskyMessage) => {
        const date = new Date(notif.createdAt).toLocaleString();
        return `
          <div class="bluesky-post">
            <div class="post-author">@${notif.author}</div>
            <div class="post-text">${escapeHtml(notif.text)}</div>
            <div class="post-date">${date}</div>
          </div>
        `;
      }).join('');
      $('#bluesky-posts').html(postsHtml);

      // Mark as seen if checkbox is checked
      const markAsSeen = $('#mark-as-seen').prop('checked');
      if (markAsSeen && notifications.length > 0) {
        await blueskyClient.markNotificationsAsSeen();
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    $('#bluesky-posts').html(`<p class="error">Error: ${errorMsg}</p>`);
  }

  $('#check-bluesky').prop('disabled', false).text('Check');
};

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  
  initializeOrchestrator();
};

const switchToPanel = (panelId: string) => {
  // Hide all panels
  $('.panel').addClass('hidden');
  // Remove active from all nav items
  $('.nav-item').removeClass('active');
  
  // Show selected panel
  $(`#${panelId}-panel`).removeClass('hidden');
  // Add active to corresponding nav item
  $(`.nav-item a[href="#${panelId}"]`).parent().addClass('active');
  
  // Update observer panel when switching to it
  if (panelId === 'observer') {
    updateObserverPanel(orchestratorState);
  }
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

  // Navigation handlers
  $('.nav-item a').on('click', (e: any) => {
    e.preventDefault();
    const href = $(e.currentTarget).attr('href');
    const panelId = href.substring(1); // Remove the #
    switchToPanel(panelId);
  });

  $('#save-config').on('click', handleConfigure);

  $('#check-bluesky').on('click', handleCheckBluesky);

  $('#refresh-observer').on('click', () => updateObserverPanel(orchestratorState));

  // Initialize
  startup();
});

