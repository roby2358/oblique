// Tests for DRAKIDION ID generation utilities
import { generateSafeBase32, generateTaskId, generateCorrelationId } from '../../src/utils/index.js';

describe('Safe-base32 ID Generation', () => {
  const SAFE_BASE32_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
  
  describe('generateSafeBase32', () => {
    it('should generate a string of the specified length', () => {
      expect(generateSafeBase32(10)).toHaveLength(10);
      expect(generateSafeBase32(24)).toHaveLength(24);
      expect(generateSafeBase32(50)).toHaveLength(50);
    });
    
    it('should only use safe-base32 characters', () => {
      const id = generateSafeBase32(100);
      for (const char of id) {
        expect(SAFE_BASE32_ALPHABET).toContain(char);
      }
    });
    
    it('should not contain excluded characters (l, 1, o, 0)', () => {
      const id = generateSafeBase32(100);
      expect(id).not.toContain('l');
      expect(id).not.toContain('1');
      expect(id).not.toContain('o');
      expect(id).not.toContain('0');
    });
    
    it('should generate different IDs each time', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSafeBase32(24));
      }
      expect(ids.size).toBe(100); // All unique
    });
  });
  
  describe('generateTaskId', () => {
    it('should generate a 24-character safe-base32 string', () => {
      const taskId = generateTaskId();
      expect(taskId).toHaveLength(24);
      for (const char of taskId) {
        expect(SAFE_BASE32_ALPHABET).toContain(char);
      }
    });
    
    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTaskId());
      }
      expect(ids.size).toBe(100);
    });
  });
  
  describe('generateCorrelationId', () => {
    it('should generate a 24-character safe-base32 string starting with "x"', () => {
      const corrId = generateCorrelationId();
      expect(corrId).toHaveLength(24);
      expect(corrId[0]).toBe('x');
      
      // Check remaining characters
      for (let i = 1; i < corrId.length; i++) {
        expect(SAFE_BASE32_ALPHABET).toContain(corrId[i]);
      }
    });
    
    it('should generate unique correlation IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });
    
    it('should always start with "x"', () => {
      for (let i = 0; i < 10; i++) {
        expect(generateCorrelationId()).toMatch(/^x/);
      }
    });
  });
});

