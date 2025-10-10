// Browser entry point
import { Agent } from './core/agent.js';
import { createMemoryStorage } from './storage/memory-storage.js';
import { createOpenRouterClient } from './hooks/llm/index.js';
import { createBlueskyClient, type BlueskyClient } from './hooks/bluesky/bluesky-client.js';
import type { BlueskyMessage } from './types/index.js';

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

let agent: Agent;
let blueskyClient: BlueskyClient | undefined;
let config: Config = {};
const userId = 'browser-user';

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
  if (!agent) {
    $('#status').text('Not initialized');
    return;
  }
  const status = agent.getStatus();
  $('#status').text(`Queue: ${status.queueSize} | Pending: ${status.pendingTasks}`);
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

  agent = await Agent.create({
    storage,
    llmClient,
    autoSave: true,
  });

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
    const response = await agent.processMessageAndWait(userId, message);
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
  $('#bluesky-posts').html('<p>Loading posts...</p>');

  try {
    // Authenticate if not already
    if (!blueskyClient.isAuthenticated()) {
      await blueskyClient.authenticate();
    }

    // Get the user's posts
    const handle = config.bluesky?.handle || '';
    const posts = await blueskyClient.getAuthorPosts(handle, 10);

    // Display posts
    if (posts.length === 0) {
      $('#bluesky-posts').html('<p>No posts found.</p>');
    } else {
      const postsHtml = posts.map((post: BlueskyMessage) => {
        const date = new Date(post.createdAt).toLocaleString();
        return `
          <div class="bluesky-post">
            <div class="post-author">@${post.author}</div>
            <div class="post-text">${escapeHtml(post.text)}</div>
            <div class="post-date">${date}</div>
          </div>
        `;
      }).join('');
      $('#bluesky-posts').html(postsHtml);
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
  
  await initializeAgent();
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

  // Initialize
  startup();
});

