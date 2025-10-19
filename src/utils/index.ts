// Utility functions

// Re-export safe-base32 utility
export { generateSafeBase32 } from './safebase32';
import { generateSafeBase32 } from './safebase32';

// Default configuration values
export const DEFAULT_CONFIG = {
  openrouter: {
    apiKey: '',
    model: 'anthropic/claude-3.5-haiku',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions'
  },
  bluesky: {
    handle: '',
    password: ''
  },
  ignoreList: []
} as const;

/**
 * Generate a DRAKIDION taskId (24-character safe-base32 string)
 * @returns 24-character safe-base32 taskId
 */
export const generateTaskId = (): string => {
  return generateSafeBase32(24);
};

/**
 * Generate a DRAKIDION correlationId (24-character safe-base32 string starting with 'X')
 * @returns 24-character safe-base32 correlationId starting with 'X'
 */
export const generateCorrelationId = (): string => {
  return 'x' + generateSafeBase32(23);
};

/**
 * Generate a DRAKIDION conversationId (24-character safe-base32 string)
 * @returns 24-character safe-base32 conversationId
 */
export const generateConversationId = (): string => {
  return generateSafeBase32(24);
};

// Legacy ID generators (kept for backward compatibility)
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
