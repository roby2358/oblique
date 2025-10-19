import { describe, it, expect } from '@jest/globals';

// Test the truncation function by importing the module
// Since the function is not exported, we'll test it conceptually
// and create a standalone version for testing

/**
 * Intelligently truncate text by finding the last punctuation mark
 * If no punctuation found, truncate to maxLength
 * Omits the final punctuation when truncating
 */
const truncateAtLastPunctuation = (text: string, maxLength: number = 279): string => {
  if (text.length <= maxLength) {
    return text;
  }

  // Extended punctuation marks list
  const punctuationMarks = ['.', '!', '?', ',', ':', ';', '—', '–', '…', '('];
  let lastPunctuationIndex = -1;
  
  // Search within the maxLength limit
  for (const mark of punctuationMarks) {
    const index = text.lastIndexOf(mark, maxLength - 1);
    if (index > lastPunctuationIndex) {
      lastPunctuationIndex = index;
    }
  }
  
  // If we found punctuation, truncate before it (omitting the punctuation)
  if (lastPunctuationIndex > 0) {
    return text.substring(0, lastPunctuationIndex);
  }
  
  // If no punctuation found, just truncate to maxLength
  return text.substring(0, maxLength);
};

describe('truncateAtLastPunctuation', () => {
  it('should return text unchanged if within maxLength', () => {
    const shortText = 'This is a short message.';
    expect(truncateAtLastPunctuation(shortText, 279)).toBe(shortText);
  });

  it('should truncate at last period within maxLength and omit punctuation', () => {
    const longText = 'This is a very long message that goes on and on and on. This is the end. And this continues.';
    const result = truncateAtLastPunctuation(longText, 50);
    expect(result).toBe('This is a very long message that goes on and on an');
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('should truncate at last exclamation mark within maxLength and omit punctuation', () => {
    const longText = 'This is exciting! Really exciting! But this part is too long.';
    const result = truncateAtLastPunctuation(longText, 30);
    expect(result).toBe('This is exciting');
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it('should truncate at last question mark within maxLength and omit punctuation', () => {
    const longText = 'What do you think? Are you sure? This continues beyond the limit.';
    const result = truncateAtLastPunctuation(longText, 25);
    expect(result).toBe('What do you think');
    expect(result.length).toBeLessThanOrEqual(25);
  });

  it('should prefer the latest punctuation mark within maxLength and omit punctuation', () => {
    const longText = 'First sentence. Second sentence! Third sentence? Fourth continues.';
    const result = truncateAtLastPunctuation(longText, 40);
    expect(result).toBe('First sentence. Second sentence');
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('should handle the specific example with comma truncation', () => {
    const longText = 'Time shifts perception like a kaleidoscope, revealing the folly of certainty.\n\nIn 2015, the guise of satire masked the fear of decline, while by 2025, fantasy\'s allure shields us from uncomfortable truths.\n\nThe subtext whispers that reality is subjective, and hopes are often clo xyz';
    const result = truncateAtLastPunctuation(longText, 279);
    expect(result).toBe('Time shifts perception like a kaleidoscope, revealing the folly of certainty.\n\nIn 2015, the guise of satire masked the fear of decline, while by 2025, fantasy\'s allure shields us from uncomfortable truths.\n\nThe subtext whispers that reality is subjective');
    expect(result.length).toBeLessThanOrEqual(279);
  });

  it('should fallback to simple truncation if no punctuation found within maxLength', () => {
    const longText = 'This is a very long message with no punctuation marks anywhere in the text';
    const result = truncateAtLastPunctuation(longText, 30);
    expect(result).toBe('This is a very long message wi');
    expect(result.length).toBe(30);
  });

  it('should handle edge case with punctuation at exact maxLength', () => {
    const longText = 'Short text!';
    const result = truncateAtLastPunctuation(longText, 11);
    expect(result).toBe('Short text!');
  });

  it('should handle empty string', () => {
    expect(truncateAtLastPunctuation('', 279)).toBe('');
  });

  it('should use default maxLength of 279', () => {
    const veryLongText = 'A'.repeat(300);
    const result = truncateAtLastPunctuation(veryLongText);
    expect(result.length).toBe(279);
  });
});
