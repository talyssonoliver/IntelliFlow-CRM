/**
 * Token Counter - B11 coverage tests
 *
 * Targets uncovered branches:
 * - getEncoderForModelSync: fallback to cl100k_base on encoding error (lines 100-114)
 * - countTokens: encode error path (lines 156-162, 219-224)
 * - countMessages: encode error path (line 186-187)
 * - countMessages: non-string content (line 181)
 * - createTokenCounter countTokens: empty text, encode failure
 * - createTokenCounter countMessages: empty array, no encoder
 * - ensureTiktokenLoaded
 * - clearEncoderCache
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock js-tiktoken
const mockEncode = vi.hoisted(() => vi.fn());
const mockGetEncoding = vi.hoisted(() => vi.fn());

vi.mock('js-tiktoken', () => ({
  getEncoding: mockGetEncoding,
}));

describe('Token Counter - b11 coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    mockEncode.mockReset();
    mockGetEncoding.mockReset();
  });

  describe('estimateTokensFromChars', () => {
    it('should return 0 for empty string', async () => {
      const { estimateTokensFromChars } = await import('../../utils/token-counter.js');
      expect(estimateTokensFromChars('')).toBe(0);
    });

    it('should return 0 for null-ish text', async () => {
      const { estimateTokensFromChars } = await import('../../utils/token-counter.js');
      expect(estimateTokensFromChars(null as any)).toBe(0);
      expect(estimateTokensFromChars(undefined as any)).toBe(0);
    });

    it('should estimate tokens from character count', async () => {
      const { estimateTokensFromChars } = await import('../../utils/token-counter.js');
      // 20 chars / 4 = 5 tokens
      expect(estimateTokensFromChars('12345678901234567890')).toBe(5);
    });

    it('should round up for non-exact divisions', async () => {
      const { estimateTokensFromChars } = await import('../../utils/token-counter.js');
      // 5 chars / 4 = 1.25 -> ceil to 2
      expect(estimateTokensFromChars('hello')).toBe(2);
    });
  });

  describe('countTokens', () => {
    it('should return 0 for empty text', async () => {
      const { countTokens } = await import('../../utils/token-counter.js');
      expect(countTokens('')).toBe(0);
    });

    it('should return 0 for null text', async () => {
      const { countTokens } = await import('../../utils/token-counter.js');
      expect(countTokens(null as any)).toBe(0);
    });

    it('should use estimation when encoder is not available', async () => {
      mockGetEncoding.mockImplementation(() => {
        throw new Error('Not available');
      });
      const { countTokens } = await import('../../utils/token-counter.js');
      const result = countTokens('hello world test');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('countMessagesTokens', () => {
    it('should return 0 for empty messages array', async () => {
      const { countMessagesTokens } = await import('../../utils/token-counter.js');
      expect(countMessagesTokens([])).toBe(0);
    });

    it('should return 0 for null messages', async () => {
      const { countMessagesTokens } = await import('../../utils/token-counter.js');
      expect(countMessagesTokens(null as any)).toBe(0);
    });
  });

  describe('clearEncoderCache', () => {
    it('should clear without error', async () => {
      const { clearEncoderCache } = await import('../../utils/token-counter.js');
      expect(() => clearEncoderCache()).not.toThrow();
    });
  });

  describe('ensureTiktokenLoaded', () => {
    it('should return a boolean', async () => {
      const { ensureTiktokenLoaded } = await import('../../utils/token-counter.js');
      const result = await ensureTiktokenLoaded();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('createTokenCounter', () => {
    it('should return a TokenCounter object', async () => {
      const { createTokenCounter } = await import('../../utils/token-counter.js');
      const counter = createTokenCounter();
      expect(counter.countTokens).toBeDefined();
      expect(counter.countMessages).toBeDefined();
    });

    it('should count tokens returning 0 for empty text', async () => {
      const { createTokenCounter } = await import('../../utils/token-counter.js');
      const counter = createTokenCounter('gpt-4');
      expect(counter.countTokens('')).toBe(0);
    });

    it('should count messages returning 0 for empty array', async () => {
      const { createTokenCounter } = await import('../../utils/token-counter.js');
      const counter = createTokenCounter('gpt-4');
      expect(counter.countMessages([])).toBe(0);
    });

    it('should handle messages with non-string content', async () => {
      const { createTokenCounter } = await import('../../utils/token-counter.js');
      const counter = createTokenCounter();
      const messages = [
        { content: [{ type: 'text', text: 'hello' }], _getType: () => 'human' } as any,
      ];
      const result = counter.countMessages(messages);
      expect(result).toBeGreaterThan(0);
    });
  });
});
