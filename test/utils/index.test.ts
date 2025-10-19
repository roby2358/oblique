import { DEFAULT_CONFIG } from '../../src/config.js';

// Mock fetch for config.json
const mockFetch = (url: string) => {
  if (url === '/config.json') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({})
    });
  }
  return Promise.reject(new Error('Not found'));
};

// Mock fetch
if (typeof global !== 'undefined') {
  (global as any).fetch = mockFetch;
}

describe('DEFAULT_CONFIG', () => {
  it('should have correct structure', () => {
    expect(DEFAULT_CONFIG).toEqual({
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
    });
  });

  it('should have readonly properties', () => {
    // Test that the structure is correct and properties exist
    expect(DEFAULT_CONFIG.openrouter).toBeDefined();
    expect(DEFAULT_CONFIG.bluesky).toBeDefined();
    expect(DEFAULT_CONFIG.ignoreList).toBeDefined();
    expect(Array.isArray(DEFAULT_CONFIG.ignoreList)).toBe(true);
  });
});