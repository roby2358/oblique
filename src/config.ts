// Configuration management module
import { DEFAULT_CONFIG } from './utils/index.js';
import { deepMerge } from './utils/deep-merge.js';

// Hold config at module level
let config: any = {};

export const getConfig = () => config;

/**
 * Load configuration from config.json
 * @returns Promise<Config> The configuration
 */
export const loadConfigWithFallbacks = async (): Promise<Record<string, any>> => {
  const result = structuredClone(DEFAULT_CONFIG);
  try {
    const response = await fetch('/config.json');
    if (response.ok) {
      const configJson = await response.json();
      
      // Deep merge config.json with defaults
      return deepMerge(result, configJson);
    } else {
      console.warn(`Could not load config.json (${response.status}), using defaults`);
    }
  } catch (error) {
    console.warn('Could not load config.json, using defaults');
  }

  return result;
};

/**
 * Initialize configuration - loads config and sets the module-level variable
 */
export const initializeConfig = async (): Promise<void> => {
  config = await loadConfigWithFallbacks();
};
