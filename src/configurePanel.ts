// Configure Panel - UI functions for handling configuration
import { addMessage, initializeOrchestrator } from './panels.js';
import { getConfig } from './config.js';
import { DEFAULT_CONFIG } from './utils/index.js';

declare const $: any;

export const createHandleConfigure = () => {
  return () => {
    const apiKey = ($('#api-key').val() as string).trim();
    const model = ($('#model').val() as string).trim();

    if (!apiKey) {
      addMessage('❌ API key is required', 'system');
      return;
    }

    // Update the config object directly
    const config = getConfig();
    config.openrouter = {
      apiKey,
      model: model || DEFAULT_CONFIG.openrouter.model,
      baseUrl: config.openrouter?.baseUrl || DEFAULT_CONFIG.openrouter.baseUrl
    };
    
    addMessage('✅ Configuration updated. Reinitializing orchestrator...', 'system');
    initializeOrchestrator(config);
  };
};

