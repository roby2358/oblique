import { describe, it, expect } from '@jest/globals';
import { createObliquePrompt, createSystemPrompt } from '../../src/prompts/oblique.js';

describe('Oblique Prompts', () => {
  describe('createObliquePrompt', () => {
    it('should create a prompt with user message', () => {
      const prompt = createObliquePrompt('What is the weather?');
      
      expect(prompt).toContain('What is the weather?');
      expect(prompt).toContain('oblique');
      expect(prompt).toContain('never directly');
    });


    it('should include instructions for oblique responses', () => {
      const prompt = createObliquePrompt('Test message');
      
      expect(prompt).toContain('metaphor');
      expect(prompt).toContain('tangentially');
      expect(prompt).toContain('enigmatic');
    });
  });

  describe('createSystemPrompt', () => {
    it('should create a system prompt', () => {
      const prompt = createSystemPrompt();
      
      expect(prompt).toContain('Oblique');
      expect(prompt).toContain('indirect');
      expect(prompt).toContain('philosophical');
    });

    it('should describe the oblique nature', () => {
      const prompt = createSystemPrompt();
      
      expect(prompt).toContain('never provide direct answers');
      expect(prompt).toContain('tangential');
    });
  });
});

