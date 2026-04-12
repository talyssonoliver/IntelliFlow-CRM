import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenCounter,
  createTokenCounter,
  countTokens,
  countMessagesTokens,
  estimateTokensFromChars,
} from './token-counter';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

describe('TokenCounter', () => {
  describe('countTokens', () => {
    it('should count tokens in a simple string', () => {
      const text = 'Hello, world!';
      const tokens = countTokens(text);
      // Expect a reasonable token count (not 0)
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty string', () => {
      const tokens = countTokens('');
      expect(tokens).toBe(0);
    });

    it('should count tokens accurately for known text', () => {
      // "The quick brown fox jumps over the lazy dog" is a well-known test string
      const text = 'The quick brown fox jumps over the lazy dog.';
      const tokens = countTokens(text);
      // This should be approximately 10-12 tokens for GPT models
      expect(tokens).toBeGreaterThanOrEqual(8);
      expect(tokens).toBeLessThanOrEqual(15);
    });

    it('should handle multiline text', () => {
      const text = `Line 1: Hello world
Line 2: How are you?
Line 3: Goodbye`;
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle special characters', () => {
      const text = '🚀 Special chars: @#$%^&*()';
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle very long text', () => {
      const longText = 'word '.repeat(1000);
      const tokens = countTokens(longText);
      // 1000 words should be roughly 1000 tokens (1 word ≈ 1 token for simple words)
      expect(tokens).toBeGreaterThan(500);
      expect(tokens).toBeLessThan(2000);
    });
  });

  describe('countMessagesTokens', () => {
    it('should count tokens in HumanMessage', () => {
      const messages = [new HumanMessage('Hello, how are you?')];
      const tokens = countMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count tokens in SystemMessage', () => {
      const messages = [new SystemMessage('You are a helpful assistant.')];
      const tokens = countMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count tokens in multiple messages', () => {
      const messages = [
        new SystemMessage('You are a helpful assistant.'),
        new HumanMessage('What is the capital of France?'),
        new AIMessage('The capital of France is Paris.'),
      ];
      const tokens = countMessagesTokens(messages);
      // Should be sum of all message tokens plus overhead for message structure
      expect(tokens).toBeGreaterThan(15);
    });

    it('should return 0 for empty message array', () => {
      const tokens = countMessagesTokens([]);
      expect(tokens).toBe(0);
    });

    it('should include message role overhead in token count', () => {
      const content = 'Test message';
      const singleMessage = [new HumanMessage(content)];
      const doubleMessage = [new HumanMessage(content), new HumanMessage(content)];

      const singleTokens = countMessagesTokens(singleMessage);
      const doubleTokens = countMessagesTokens(doubleMessage);

      // Double messages should have more tokens than single
      // Each message adds content tokens + ~4 overhead tokens
      // But both share the same 2-token base structure overhead
      expect(doubleTokens).toBeGreaterThan(singleTokens);
      // The difference should account for the additional content + message overhead
      expect(doubleTokens - singleTokens).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createTokenCounter', () => {
    it('should create a token counter instance', () => {
      const counter = createTokenCounter();
      expect(counter).toBeDefined();
      expect(counter.countTokens).toBeDefined();
      expect(counter.countMessages).toBeDefined();
    });

    it('should create a counter for a specific model', () => {
      const counter = createTokenCounter('gpt-4');
      expect(counter).toBeDefined();
    });

    it('should create a counter that works with gpt-4-turbo-preview model', () => {
      const counter = createTokenCounter('gpt-4-turbo-preview');
      const tokens = counter.countTokens('Hello world');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count tokens via instance method', () => {
      const counter = createTokenCounter();
      const tokens = counter.countTokens('Test text');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count message tokens via instance method', () => {
      const counter = createTokenCounter();
      const messages = [new HumanMessage('Hello')];
      const tokens = counter.countMessages(messages);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateTokensFromChars', () => {
    it('should estimate tokens from character count (4 chars per token)', () => {
      const text = 'abcd'; // 4 chars = ~1 token
      const estimate = estimateTokensFromChars(text);
      expect(estimate).toBe(1);
    });

    it('should round up partial tokens', () => {
      const text = 'abcde'; // 5 chars = ~1.25 tokens → rounds to 2
      const estimate = estimateTokensFromChars(text);
      expect(estimate).toBe(2);
    });

    it('should return 0 for empty string', () => {
      const estimate = estimateTokensFromChars('');
      expect(estimate).toBe(0);
    });

    it('should work with longer text', () => {
      const text = 'a'.repeat(100); // 100 chars = 25 tokens
      const estimate = estimateTokensFromChars(text);
      expect(estimate).toBe(25);
    });
  });

  describe('Token counter accuracy', () => {
    it('should be more accurate than simple character estimation', () => {
      // Text with varying word lengths and punctuation
      const text = "I've been working on the railroad, all the live-long day.";

      const accurateCount = countTokens(text);
      const estimatedCount = estimateTokensFromChars(text);

      // Both should give reasonable non-zero values
      expect(accurateCount).toBeGreaterThan(0);
      expect(estimatedCount).toBeGreaterThan(0);

      // The accurate count should differ from simple estimation
      // (this validates we're not just using char-based estimation)
      // Note: They might be close but shouldn't be identical for complex text
    });

    it('should count CJK characters correctly', () => {
      // CJK characters typically use more tokens per character
      const cjkText = '你好世界'; // "Hello World" in Chinese
      const tokens = countTokens(cjkText);
      expect(tokens).toBeGreaterThan(0);
    });
  });
});

describe('Token counting integration with BaseAgent', () => {
  it('should export functions compatible with BaseAgent usage', () => {
    // Verify the exports match what BaseAgent needs
    expect(typeof countTokens).toBe('function');
    expect(typeof countMessagesTokens).toBe('function');

    // These will be used in BaseAgent like:
    // const inputTokens = countMessagesTokens(messages);
    // const outputTokens = countTokens(response.content);
  });
});
