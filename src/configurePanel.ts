// Configure Panel - UI functions for handling configuration
import { addMessage, initializeOrchestrator } from './panels.js';

declare const $: any;

export const createHandleConfigure = () => {
  return () => {
    const apiKey = ($('#api-key').val() as string).trim();
    const model = ($('#model').val() as string).trim() || 'anthropic/claude-3.5-haiku';

    if (apiKey) {
      localStorage.setItem('openrouter_api_key', apiKey);
      localStorage.setItem('openrouter_model', model);
      addMessage('✅ Configuration saved. Reinitializing orchestrator...', 'system');
      initializeOrchestrator();
    }
  };
};

