// Utility functions

// Safe-base32 alphabet: a-z + 0-9 excluding l, 1, o, 0 (32 characters total)
const SAFE_BASE32_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a random safe-base32 string
 * @param length - Length of the string to generate
 * @returns Random safe-base32 string
 */
export const generateSafeBase32 = (length: number): string => {
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * SAFE_BASE32_ALPHABET.length);
    result += SAFE_BASE32_ALPHABET[randomIndex];
  }
  return result;
};

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

// Legacy ID generators (kept for backward compatibility)
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const generateUUID = (): string => {
  // Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const generateConversationId = (): string => {
  return generateUUID();
};

export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
};

