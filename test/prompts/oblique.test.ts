import { describe, it, expect } from '@jest/globals';
import { obliquePrompt, systemPrompt } from '../../src/prompts/oblique.js';

describe('Oblique Prompts', () => {
  describe('obliquePrompt', () => {
    it('should create a prompt with user message', () => {
      const prompt = obliquePrompt('What is the weather?');
      
      expect(prompt).toContain('What is the weather?');
      expect(prompt).toContain('oblique');
      expect(prompt).toContain('never directly');
    });


    it('should include instructions for oblique responses', () => {
      const prompt = obliquePrompt('Test message');
      
      expect(prompt).toContain('Respond');
      expect(prompt).toContain('tangentially');
      expect(prompt).toContain('philosophical');
    });
  });

  describe('systemPrompt', () => {
    it('should create a system prompt', () => {
      const prompt = systemPrompt;
      
      expect(prompt).toContain('Oblique');
      expect(prompt).toContain('indirect');
      expect(prompt).toContain('philosophical');
    });

    it('should describe the oblique nature', () => {
      const prompt = systemPrompt;
      
      expect(prompt).toContain('never provide direct answers');
      expect(prompt).toContain('tangential');
    });
  });
});

