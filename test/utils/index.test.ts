import { describe, it, expect } from '@jest/globals';
import { generateId, wait, truncate } from '../../src/utils/index.js';

describe('Utils', () => {
  describe('generateId', () => {
    it('should generate a unique id', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateId();
      const after = Date.now();
      
      const timestamp = parseInt(id.split('-')[0]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('wait', () => {
    it('should wait for specified milliseconds', async () => {
      const start = Date.now();
      await wait(100);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow for some variance
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      const str = 'This is a very long string that needs truncation';
      const truncated = truncate(str, 20);
      
      expect(truncated).toHaveLength(20);
      expect(truncated).toBe('This is a very lo...');
    });

    it('should not truncate short strings', () => {
      const str = 'Short';
      const truncated = truncate(str, 20);
      
      expect(truncated).toBe(str);
    });

    it('should handle exact length', () => {
      const str = 'Exact';
      const truncated = truncate(str, 5);
      
      expect(truncated).toBe(str);
    });

    it('should add ellipsis for truncated strings', () => {
      const str = 'This will be truncated';
      const truncated = truncate(str, 10);
      
      expect(truncated.endsWith('...')).toBe(true);
      expect(truncated).toHaveLength(10);
    });
  });
});

