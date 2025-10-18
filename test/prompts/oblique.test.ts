import { describe, it, expect } from '@jest/globals';
import { 
  obliquePrompt, 
  systemPrompt, 
  createObliqueConversation,
  getRandomTextLens,
  type ObliqueTextLens 
} from '../../src/prompts/oblique.js';

describe('Oblique Prompts', () => {
  describe('obliquePrompt', () => {
    it('should create a prompt with user message and thread history', () => {
      const userMessage = 'What is the weather?';
      const threadHistory = '@user1: It\'s sunny today\n@user2: Really nice weather';
      const prompt = obliquePrompt(userMessage, threadHistory);
      
      expect(prompt).toContain(userMessage);
      expect(prompt).toContain(threadHistory);
      expect(prompt).toContain('Reply through the chosen lens');
    });

    it('should include thread history section', () => {
      const prompt = obliquePrompt('Test message', 'Previous conversation');
      
      expect(prompt).toContain('Thread history');
      expect(prompt).toContain('Previous conversation');
    });
  });

  describe('systemPrompt', () => {
    it('should create a system prompt', () => {
      expect(systemPrompt).toContain('Oblique');
      expect(systemPrompt).toContain('supertext');
      expect(systemPrompt).toContain('subtext');
      expect(systemPrompt).toContain('architext');
      expect(systemPrompt).toContain('psychotext');
    });

    it('should describe the oblique nature', () => {
      expect(systemPrompt).toContain('reveals deeper truths');
      expect(systemPrompt).toContain('rumination and reflection');
      expect(systemPrompt).toContain('brief (1-2 sentences)');
    });
  });

  describe('getRandomTextLens', () => {
    it('should return a valid text lens', () => {
      const lens = getRandomTextLens();
      const validLenses: ObliqueTextLens[] = ['supertext', 'subtext', 'architext', 'psychotext'];
      
      expect(validLenses).toContain(lens);
    });

    it('should return different lenses over multiple calls', () => {
      const lenses = new Set();
      for (let i = 0; i < 100; i++) {
        lenses.add(getRandomTextLens());
      }
      
      // Should get at least 2 different lenses in 100 calls
      expect(lenses.size).toBeGreaterThan(1);
    });
  });

  describe('createObliqueConversation', () => {

    it('should split last post from thread history', () => {
      const mockThread = [
        { author: 'user1', text: 'First post', altTexts: [] },
        { author: 'user2', text: 'Second post', altTexts: [] },
        { author: 'user3', text: 'Last post', altTexts: [] }
      ];

      const result = createObliqueConversation(mockThread);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[1].role).toBe('user');
      
      // Check that the user message contains the last post
      expect(result[1].content).toContain('@user3: Last post');
      
      // Check that thread history contains the previous posts
      expect(result[1].content).toContain('@user1: First post');
      expect(result[1].content).toContain('@user2: Second post');
    });

    it('should handle single post in thread', () => {
      const mockThread = [
        { author: 'user1', text: 'Only post', altTexts: [] }
      ];

      const result = createObliqueConversation(mockThread);

      expect(result).toHaveLength(2);
      expect(result[1].content).toContain('@user1: Only post');
      // With single post, thread history should be empty but still present
      expect(result[1].content).toContain('Thread history');
      expect(result[1].content).toContain('""'); // Empty thread history
    });

    it('should format posts with alt texts correctly', () => {
      const mockThread = [
        { 
          author: 'user1', 
          text: 'Post with image', 
          altTexts: ['Image description', 'Another alt text'] 
        },
        { author: 'user2', text: 'Simple post', altTexts: [] }
      ];

      const result = createObliqueConversation(mockThread);

      expect(result[1].content).toContain('@user1: Post with image');
      expect(result[1].content).toContain('  - Image description');
      expect(result[1].content).toContain('  - Another alt text');
      expect(result[1].content).toContain('@user2: Simple post');
    });

    it('should include alt texts in the last post (notification trigger)', () => {
      const mockThread = [
        { author: 'user1', text: 'First post', altTexts: [] },
        { 
          author: 'user2', 
          text: 'Last post with image', 
          altTexts: ['Beautiful sunset', 'Ocean view'] 
        }
      ];

      const result = createObliqueConversation(mockThread);

      // The last post should be in the main user message with alt texts
      expect(result[1].content).toContain('@user2: Last post with image');
      expect(result[1].content).toContain('  - Beautiful sunset');
      expect(result[1].content).toContain('  - Ocean view');
      
      // Thread history should contain the first post without alt texts
      expect(result[1].content).toContain('@user1: First post');
    });

  });
});

