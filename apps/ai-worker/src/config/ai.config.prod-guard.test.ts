/**
 * Tests for the production "mock" provider guardrail in loadAIConfig().
 *
 * Regression guard for the prod incident where the worker silently loaded
 * provider=mock / model=mock / endpoint=mock in production — 53 minutes of
 * zero-op scoring/insight jobs at $0.00. Production must fail fast instead.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { loadAIConfig } from './ai.config';

describe('loadAIConfig — production mock guardrail', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('throws a clear error when NODE_ENV=production and AI_PROVIDER=mock', () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_PROVIDER = 'mock';

    expect(() => loadAIConfig()).toThrow(/AI_PROVIDER="mock" is not permitted/i);
  });

  it('does NOT throw for a real provider (litellm) in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_PROVIDER = 'litellm';
    // main's loadAIConfig requires the ACTIVE provider's base URL in production
    // (provider-gated requiredProdEnv, #238/ADR-048). Set it so this case
    // isolates the mock guardrail rather than tripping the URL gate.
    process.env.LITELLM_BASE_URL = 'http://litellm.internal.test/v1';

    expect(() => loadAIConfig()).not.toThrow();
    expect(loadAIConfig().provider).toBe('litellm');
  });

  it('does NOT throw for a real provider (openai) in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_PROVIDER = 'openai';

    expect(() => loadAIConfig()).not.toThrow();
  });

  it('still allows AI_PROVIDER=mock outside production (test/dev)', () => {
    process.env.NODE_ENV = 'test';
    process.env.AI_PROVIDER = 'mock';

    expect(() => loadAIConfig()).not.toThrow();
    expect(loadAIConfig().provider).toBe('mock');
  });
});
