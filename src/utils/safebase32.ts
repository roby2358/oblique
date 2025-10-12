// Safe-base32 alphabet: a-z + 0-9 excluding l, 1, o, 0 (32 characters total)
const SAFE_BASE32_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a random safe-base32 string
 * @param length - Length of the string to generate
 * @returns Random safe-base32 string
 */
export const generateSafeBase32 = (length: number): string => {
  return Array.from({ length }, () => 
    SAFE_BASE32_ALPHABET[Math.floor(Math.random() * SAFE_BASE32_ALPHABET.length)]
  ).join('');
};

