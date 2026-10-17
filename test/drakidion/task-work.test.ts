// Unit tests for the DRAKIDION work product
import { describe, it, expect } from '@jest/globals';
import { latestWork } from '../../src/drakidion/task-work.js';

describe('latestWork', () => {
  it('should return the line the last step appended', () => {
    expect(latestWork(['<thinking>', 'Waiting for LLM response...', 'A door is not a question.']))
      .toBe('A door is not a question.');
  });

  it('should return the empty string when no step has produced a line', () => {
    expect(latestWork([])).toBe('');
  });
});
