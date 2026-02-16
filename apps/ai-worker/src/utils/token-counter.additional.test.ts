/**
 * Token Counter Additional Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEncode = vi.fn().mockReturnValue([1, 2, 3, 4, 5]);
const mockEncoder = { encode: mockEncode, decode: vi.fn(), free: vi.fn() };
const mockGetEncoding = vi.fn().mockReturnValue(mockEncoder);

vi.mock('js-tiktoken', () => ({ getEncoding: mockGetEncoding }));
vi.mock('pino', () => ({
  default: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}));
vi.mock('@langchain/core/messages', () => ({
  BaseMessage: class {
    content: any;
    constructor(c: any) {
      this.content = c;
    }
  },
}));

import {
  createTokenCounter,
  countTokens,
  countMessagesTokens,
  estimateTokensFromChars,
  clearEncoderCache,
  ensureTiktokenLoaded,
} from './token-counter';
import { BaseMessage } from '@langchain/core/messages';

describe('clearEncoderCache', () => {
  it('should clear without error', () => {
    expect(() => clearEncoderCache()).not.toThrow();
  });
  it('should allow re-creation after clear', () => {
    const c = createTokenCounter('gpt-4');
    c.countTokens('hello');
    clearEncoderCache();
    expect(c.countTokens('world')).toBeGreaterThanOrEqual(0);
  });
});

describe('ensureTiktokenLoaded', () => {
  it('should resolve boolean', async () => {
    expect(typeof (await ensureTiktokenLoaded())).toBe('boolean');
  });
});

describe('countTokens models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEncoderCache();
  });
  it('gpt-4', () => {
    expect(countTokens('Hello', 'gpt-4')).toBeGreaterThan(0);
  });
  it('gpt-4o', () => {
    expect(countTokens('Hello', 'gpt-4o')).toBeGreaterThan(0);
  });
  it('gpt-4o-mini', () => {
    expect(countTokens('Hello', 'gpt-4o-mini')).toBeGreaterThan(0);
  });
  it('gpt-3.5-turbo', () => {
    expect(countTokens('Hello', 'gpt-3.5-turbo')).toBeGreaterThan(0);
  });
  it('embedding model', () => {
    expect(countTokens('Hello', 'text-embedding-ada-002')).toBeGreaterThan(0);
  });
  it('unknown model fallback', () => {
    expect(countTokens('Hello', 'unknown-model')).toBeGreaterThan(0);
  });
  it('empty string returns 0', () => {
    expect(countTokens('')).toBe(0);
  });
  it('null returns 0', () => {
    expect(countTokens(null as any)).toBe(0);
  });
  it('undefined returns 0', () => {
    expect(countTokens(undefined as any)).toBe(0);
  });
});

describe('estimateTokensFromChars', () => {
  it('empty returns 0', () => {
    expect(estimateTokensFromChars('')).toBe(0);
  });
  it('null returns 0', () => {
    expect(estimateTokensFromChars(null as any)).toBe(0);
  });
  it('~4 chars per token', () => {
    expect(estimateTokensFromChars('12345678901234567890')).toBe(5);
  });
  it('rounds up', () => {
    expect(estimateTokensFromChars('hello')).toBe(2);
  });
});

describe('createTokenCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEncoderCache();
  });
  it('creates with default model', () => {
    const c = createTokenCounter();
    expect(c.countTokens).toBeDefined();
  });
  it('counts text tokens', () => {
    expect(createTokenCounter('gpt-4').countTokens('Hi')).toBeGreaterThan(0);
  });
  it('empty text returns 0', () => {
    expect(createTokenCounter().countTokens('')).toBe(0);
  });
  it('counts messages', () => {
    const msgs = [{ content: 'Hello' } as any as BaseMessage];
    expect(createTokenCounter('gpt-4').countMessages(msgs)).toBeGreaterThan(0);
  });
  it('empty messages returns 0', () => {
    expect(createTokenCounter().countMessages([])).toBe(0);
  });
  it('null messages returns 0', () => {
    expect(createTokenCounter().countMessages(null as any)).toBe(0);
  });
  it('non-string content via JSON.stringify', () => {
    const msgs = [{ content: { type: 'text', text: 'hi' } } as any as BaseMessage];
    expect(createTokenCounter('gpt-4').countMessages(msgs)).toBeGreaterThan(0);
  });
});

describe('countMessagesTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEncoderCache();
  });
  it('counts messages', () => {
    expect(countMessagesTokens([{ content: 'Hi' } as any], 'gpt-4')).toBeGreaterThan(0);
  });
  it('empty returns 0', () => {
    expect(countMessagesTokens([])).toBe(0);
  });
  it('null returns 0', () => {
    expect(countMessagesTokens(null as any)).toBe(0);
  });
});

describe('encoder error fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEncoderCache();
  });
  it('falls back when encode throws', () => {
    mockEncode.mockImplementationOnce(() => {
      throw new Error('fail');
    });
    expect(countTokens('Hello world test', 'gpt-4')).toBeGreaterThan(0);
  });
  it('falls back when getEncoding throws for model', () => {
    mockGetEncoding.mockImplementationOnce((n: string) => {
      if (n === 'o200k_base') throw new Error('x');
      return mockEncoder;
    });
    clearEncoderCache();
    expect(countTokens('Hello', 'gpt-4o')).toBeGreaterThan(0);
  });
});
