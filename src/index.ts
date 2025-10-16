// Browser entry point
import { loadConfig, setConfig, initializeOrchestrator } from './panels.js';
import { updateObserverPanel } from './orchestratorPanel.js';
import { updateQueuePanel } from './queuePanel.js';
import { updateWaitingPanel } from './waitingPanel.js';
import { createHandleSendMessage } from './chatPanel.js';
import { createHandleCheckBluesky } from './bluesky-panel.js';
import { createHandleTogglePolling } from './bluesky-polling.js';
import { createHandleConfigure } from './configurePanel.js';

// jQuery is loaded via CDN in index.html
// Note: Run 'npm install' to get jQuery type definitions from @types/jquery
declare const $: any;

// Load configuration and initialize
const startup = async () => {
  const config = await loadConfig();
  setConfig(config);
  
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
    updateObserverPanel();
  }
  
  // Update queue panel when switching to it
  if (panelId === 'queue') {
    updateQueuePanel();
  }
  
  // Update waiting panel when switching to it
  if (panelId === 'waiting') {
    updateWaitingPanel();
  }
};

// Expose debug functions to window for console access
(window as any).oblique = {
  getState: () => {
    const { getOrchestratorState, getLLMClient, getBlueskyClient } = require('./panels.js');
    return {
      orchestrator: getOrchestratorState(),
      hasLLM: !!getLLMClient(),
      hasBluesky: !!getBlueskyClient(),
    };
  },
  processNext: async () => {
    const panels = await import('./panels.js');
    const Orchestrator = await import('./drakidion/orchestrator.js');
    let state = panels.getOrchestratorState();
    const result = await Orchestrator.processNextTask(state);
    panels.setOrchestratorState(result.state);
    panels.updateStatus();
    return result;
  },
  processAll: async () => {
    const panels = await import('./panels.js');
    const Orchestrator = await import('./drakidion/orchestrator.js');
    let state = panels.getOrchestratorState();
    state = await Orchestrator.processAllTasks(state);
    panels.setOrchestratorState(state);
    panels.updateStatus();
    return state;
  },
};

// jQuery document ready
$(document).ready(() => {
  // Create panel handlers
  const handleSendMessage = createHandleSendMessage();
  const handleCheckBluesky = createHandleCheckBluesky();
  const handleTogglePolling = createHandleTogglePolling();
  const handleConfigure = createHandleConfigure();

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

  $('#toggle-polling').on('click', handleTogglePolling);

  $('#refresh-observer').on('click', () => updateObserverPanel());

  $('#refresh-queue').on('click', () => updateQueuePanel());

  $('#refresh-waiting').on('click', () => updateWaitingPanel());

  // Initialize
  startup();
});
