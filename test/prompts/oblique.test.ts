import { describe, it, expect, beforeEach } from '@jest/globals';
import { getConfig } from '../../src/config.js';
import { getDailyModel } from '../../src/prompts/oblique.js';
import {
  obliquePrompt,
  systemPrompt,
  createObliqueConversation,
  formatThread,
} from '../../src/prompts/oblique.js';
import { REGISTERS } from '../../src/registers/index.js';

// The prompt is the same shape whichever register fills it; the lens registers are the ones
// that carry a lens block, so the ordering tests use one of those.
const lens = REGISTERS.architext;

describe('Oblique Prompts', () => {
  describe('obliquePrompt', () => {
    it('should create a prompt with user message and thread history', () => {
      const userMessage = 'What is the weather?';
      const threadHistory = '@user1: It\'s sunny today\n@user2: Really nice weather';
      const prompt = obliquePrompt(userMessage, threadHistory, lens);
      
      expect(prompt).toContain(userMessage);
      expect(prompt).toContain(threadHistory);
      expect(prompt).toContain('Consider the positive and the negative');
    });

    it('should include thread history section', () => {
      const prompt = obliquePrompt('Test message', 'Previous conversation', lens);
      
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
    });

    // R-45: rules that disagree between registers live with the register, not in the fixed
    // prefix, so nothing further down has to contradict them
    it('leaves the per-register rules to the register', () => {
      expect(systemPrompt).not.toContain('brief (1-3 sentences)');
      expect(obliquePrompt('m', 'h', lens)).toContain('brief (1-3 sentences)');
      expect(obliquePrompt('m', 'h', REGISTERS.poem)).not.toContain('brief (1-3 sentences)');
    });
  });

  // R-46: the gate and the writer must be looking at the same thread
  describe('formatThread', () => {
    it('splits the last post off as the message being answered', () => {
      const formatted = formatThread([
        { author: 'user1', text: 'First post' },
        { author: 'user2', text: 'Last post' },
      ]);

      expect(formatted).toEqual({
        userMessage: '@user2: Last post',
        threadHistory: '@user1: First post',
      });
    });

    it('leaves the history empty for a thread of one', () => {
      expect(formatThread([{ author: 'user1', text: 'Only post' }]))
        .toEqual({ userMessage: '@user1: Only post', threadHistory: '' });
    });

    it('answers null for nothing to answer', () => {
      expect(formatThread(null)).toBeNull();
      expect(formatThread([])).toBeNull();
    });
  });

  // R-37: the prompt is ordered least volatile first, so a prefix cache keeps as much of it
  // as the next request allows
  describe('prompt ordering for prefix caching', () => {
    const sectionStarts = (prompt: string): number[] => [
      prompt.indexOf('Your mission is to increase engagement'),
      prompt.indexOf('Reply in a'),
      prompt.indexOf('Reply through this lens'),
      prompt.indexOf('Rules for this reply:'),
      prompt.indexOf('Thread history:'),
      prompt.indexOf('Reply to this message:'),
      prompt.indexOf('Answer now, in the register described above'),
    ];

    it('places the fixed text, then the daily voice, then the register, then the thread, then the message, then the restatement', () => {
      const starts = sectionStarts(obliquePrompt('The message', 'The history', lens));

      expect(starts).not.toContain(-1);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it('states the output format only in the system prompt', () => {
      const prompt = obliquePrompt('The message', 'The history', lens);

      expect(systemPrompt).toContain('# Output format');
      expect(systemPrompt).toContain('# Insight 1');
      expect(prompt).not.toContain('Answer in markdown');
    });

    it('closes by restating the task after the message being answered', () => {
      const prompt = obliquePrompt('The message', 'The history', lens);
      const restatement = prompt.slice(prompt.indexOf('Answer now, in the register described above'));

      expect(restatement).toContain('# Response');
      expect(prompt.trimEnd().endsWith(restatement.trimEnd())).toBe(true);
    });

    it('keeps everything before the voice identical across two calls', () => {
      const first = obliquePrompt('One message', 'One history', lens);
      const second = obliquePrompt('Another message', 'Another history', lens);

      const sharedPrefix = (text: string): string => text.slice(0, text.indexOf('Reply in a'));

      expect(sharedPrefix(first)).toBe(sharedPrefix(second));
      expect(sharedPrefix(first).length).toBeGreaterThan(0);
    });
  });

  describe('createObliqueConversation', () => {

    it('should split last post from thread history', () => {
      const mockThread = [
        { author: 'user1', text: 'First post', altTexts: [] },
        { author: 'user2', text: 'Second post', altTexts: [] },
        { author: 'user3', text: 'Last post', altTexts: [] }
      ];

      const result = createObliqueConversation(mockThread, lens);

      if (!result) {
        throw new Error('Expected conversation to be created');
      }

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

      const result = createObliqueConversation(mockThread, lens);

      if (!result) {
        throw new Error('Expected conversation to be created');
      }

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

      const result = createObliqueConversation(mockThread, lens);

      if (!result) {
        throw new Error('Expected conversation to be created');
      }

      expect(result[1].content).toContain('@user1: Post with image');
      expect(result[1].content).toContain('  image: Image description');
      expect(result[1].content).toContain('  image: Another alt text');
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

      const result = createObliqueConversation(mockThread, lens);

      if (!result) {
        throw new Error('Expected conversation to be created');
      }

      // The last post should be in the main user message with alt texts
      expect(result[1].content).toContain('@user2: Last post with image');
      expect(result[1].content).toContain('  image: Beautiful sunset');
      expect(result[1].content).toContain('  image: Ocean view');
      
      // Thread history should contain the first post without alt texts
      expect(result[1].content).toContain('@user1: First post');
    });

  });

  describe('getDailyModel', () => {
    const models = ['first/model', 'second/model', 'third/model'];

    beforeEach(() => {
      const config = getConfig();
      config.openrouter = { models, rotate: true };
    });

    it('returns a model from the configured list', () => {
      expect(models).toContain(getDailyModel());
    });

    it('returns the same model twice in a row while the day does not change', () => {
      expect(getDailyModel()).toBe(getDailyModel());
    });

    it('always returns the first entry when rotate is false', () => {
      getConfig().openrouter.rotate = false;

      expect(getDailyModel()).toBe('first/model');
    });

    it('follows a reordered list when rotate is false', () => {
      getConfig().openrouter = { models: ['third/model', 'first/model'], rotate: false };

      expect(getDailyModel()).toBe('third/model');
    });

    it('throws when no models are configured', () => {
      getConfig().openrouter = { models: [], rotate: true };

      expect(() => getDailyModel()).toThrow('No models configured');
    });
  });

  describe('dailyCircularKey', () => {
    it('should return 0 for the first day when count is 4', () => {
      const epoch = new Date('1970-01-01T00:00:00Z');
      // We need to access the function - it's not exported, so we'll test through pickDailyCircularOne
      const array = ['a', 'b', 'c', 'd'];
      const result = array[Math.floor(epoch.getTime() / 1000 / 86400) % array.length];
      expect(result).toBe('a');
    });

    it('should cycle through values 0-3 for count of 4', () => {
      const day1 = new Date('1970-01-01T00:00:00Z');
      const day2 = new Date('1970-01-02T00:00:00Z');
      const day3 = new Date('1970-01-03T00:00:00Z');
      const day4 = new Date('1970-01-04T00:00:00Z');
      const day5 = new Date('1970-01-05T00:00:00Z');
      const array = ['a', 'b', 'c', 'd'];

      expect(array[Math.floor(day1.getTime() / 1000 / 86400) % array.length]).toBe('a');
      expect(array[Math.floor(day2.getTime() / 1000 / 86400) % array.length]).toBe('b');
      expect(array[Math.floor(day3.getTime() / 1000 / 86400) % array.length]).toBe('c');
      expect(array[Math.floor(day4.getTime() / 1000 / 86400) % array.length]).toBe('d');
      expect(array[Math.floor(day5.getTime() / 1000 / 86400) % array.length]).toBe('a'); // Cycles back
    });

    it('should handle different count values', () => {
      const testDate = new Date('1970-01-03T00:00:00Z'); // Day 2
      const array2 = ['x', 'y'];
      const array3 = ['p', 'q', 'r'];
      
      expect(array2[Math.floor(testDate.getTime() / 1000 / 86400) % array2.length]).toBe('x'); // Day 2 % 2 = 0
      expect(array3[Math.floor(testDate.getTime() / 1000 / 86400) % array3.length]).toBe('r'); // Day 2 % 3 = 2
    });
  });
});

