// Configuration management module
import { deepMerge } from './utils/deep-merge.js';

// Default configuration values
export const DEFAULT_CONFIG = {
  openrouter: {
    apiKey: '',
    // The daily rotation walks this list one entry per UTC day. With rotate false the
    // first entry is always used, so reordering the list picks the model.
    models: [
      'anthropic/claude-sonnet-4.5',
      'deepcogito/cogito-v2-preview-llama-405b',
      'deepseek/deepseek-v3.2-exp',
      'google/gemini-2.5-pro',
      'openai/gpt-4o',
      'openai/gpt-5',
      'openai/gpt-5-mini',
      'meta-llama/llama-3.1-405b-instruct',
      'meta-llama/llama-3.3-70b-instruct',
      'meta-llama/llama-4-maverick:free',
      'moonshotai/kimi-k2',
      'openai/o3-mini',
      'mistralai/mistral-large-2411',
      'qwen/qwen3-235b-a22b-2507',
      'qwen/qwen3-235b-a22b-thinking-2507'
    ],
    rotate: true,
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions'
  },
  bluesky: {
    handle: '',
    password: ''
  },
  ignoreList: [],
  botList: []
} as const;

// Hold config at module level
let config: any = {};

export const getConfig = () => config;

/**
 * Fetch /config.json. A missing, non-OK or malformed file is a warning, not a failure:
 * the page loads unconfigured and says so.
 * @returns The parsed file, or an empty object when it could not be read.
 */
const fetchConfigFile = async (): Promise<Record<string, any>> => {
  try {
    const response = await fetch('/config.json');

    if (!response.ok) {
      console.warn(`Could not load config.json (${response.status}), using defaults`);
      return {};
    }

    return await response.json();
  } catch (error) {
    console.warn('Could not load config.json, using defaults:', error);
    return {};
  }
};

/**
 * Load configuration: the defaults, then /config.json merged over them. config.json is the
 * only source — nothing is read from or written to the browser.
 * @returns Promise<Config> The configuration
 */
export const loadConfigWithFallbacks = async (): Promise<Record<string, any>> => {
  const result = structuredClone(DEFAULT_CONFIG);

  deepMerge(result, await fetchConfigFile());

  return result;
};

/**
 * Initialize configuration - loads config and sets the module-level variable
 */
export const initializeConfig = async (): Promise<void> => {
  config = await loadConfigWithFallbacks();
};
