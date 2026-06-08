/**
 * Tests for resolveFallbackProvider — the gating logic for the job-level
 * OpenRouter⇄LiteLLM provider fallback (#324).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// Pin the active provider so the "same as active" branch is deterministic.
vi.mock('../config/ai.config', async (importActual) => {
  const actual = await importActual<typeof import('../config/ai.config')>();
  return { ...actual, aiConfig: { ...actual.aiConfig, provider: 'openrouter' } };
});

import { resolveFallbackProvider } from './llm-factory';

describe('resolveFallbackProvider (#324)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when AI_FALLBACK_PROVIDER is unset/empty', () => {
    vi.stubEnv('AI_FALLBACK_PROVIDER', '');
    expect(resolveFallbackProvider()).toBeNull();
  });

  it('returns the provider when set, valid, and different from the active provider', () => {
    vi.stubEnv('AI_FALLBACK_PROVIDER', 'litellm'); // active is openrouter
    expect(resolveFallbackProvider()).toBe('litellm');
  });

  it('returns null for the no-op mock provider (never fall back to mock)', () => {
    vi.stubEnv('AI_FALLBACK_PROVIDER', 'mock');
    expect(resolveFallbackProvider()).toBeNull();
  });

  it('returns null when the fallback equals the active provider (pointless)', () => {
    vi.stubEnv('AI_FALLBACK_PROVIDER', 'openrouter'); // == active
    expect(resolveFallbackProvider()).toBeNull();
  });

  it('returns null for an invalid provider value', () => {
    vi.stubEnv('AI_FALLBACK_PROVIDER', 'not-a-real-provider');
    expect(resolveFallbackProvider()).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    vi.stubEnv('AI_FALLBACK_PROVIDER', '  litellm  ');
    expect(resolveFallbackProvider()).toBe('litellm');
  });
});
