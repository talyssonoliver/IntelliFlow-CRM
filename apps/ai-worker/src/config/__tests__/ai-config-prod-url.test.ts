/**
 * Regression test: production AI-provider base-URL fail-fast must be scoped to
 * the ACTIVE provider only.
 *
 * Background: loadAIConfig() previously called requiredProdEnv() UNCONDITIONALLY
 * for both LITELLM_BASE_URL and OLLAMA_BASE_URL. In production that crash-looped
 * apps/ai-worker whenever the OpenAI direct-client path (AI_PROVIDER=openai) was
 * used with those vars unset — which is exactly the configuration ADR-048
 * prescribes ("unset LITELLM_BASE_URL → direct-client path"). apps/api's
 * container.ts already gates the same requiredProdEnv() calls by provider; this
 * test locks ai-worker to the same invariant so the regression cannot return.
 *
 * Invariant: only the active provider's base URL is required in production.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { loadAIConfig } from '../ai.config';

describe('loadAIConfig — production provider URL gating (regression)', () => {
  beforeEach(() => {
    // Activate the requiredProdEnv production guard (and ensure we are not in the
    // Next.js production-build phase, which deliberately disables it).
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', '');
    // Exercise the "unset in production" path for both inactive-provider URLs.
    vi.stubEnv('LITELLM_BASE_URL', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does NOT throw for AI_PROVIDER=openai when LITELLM/OLLAMA URLs are unset', () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    expect(() => loadAIConfig()).not.toThrow();
    expect(loadAIConfig().provider).toBe('openai');
  });

  it('DOES throw for AI_PROVIDER=mock in production (issue 5: no silent zero-op mock fallback)', () => {
    // mock is exempt from the base-URL gate (it dials no provider), but running
    // the mock provider in production is itself a misconfiguration — zero real
    // LLM calls, $0.00 cost (the 2026-06 incident). loadAIConfig() now fails
    // fast instead of booting into a silent no-op. See ai.config.prod-guard.test.ts.
    vi.stubEnv('AI_PROVIDER', 'mock');
    expect(() => loadAIConfig()).toThrow(/AI_PROVIDER="mock" is not permitted/);
  });

  it('DOES throw for AI_PROVIDER=litellm when LITELLM_BASE_URL is unset (active provider must be loud)', () => {
    vi.stubEnv('AI_PROVIDER', 'litellm');
    expect(() => loadAIConfig()).toThrow(/LITELLM_BASE_URL must be set in production/);
  });

  it('DOES throw for AI_PROVIDER=ollama when OLLAMA_BASE_URL is unset (active provider must be loud)', () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    expect(() => loadAIConfig()).toThrow(/OLLAMA_BASE_URL must be set in production/);
  });

  it('keeps the active LiteLLM URL when it IS set in production', () => {
    vi.stubEnv('AI_PROVIDER', 'litellm');
    vi.stubEnv('LITELLM_BASE_URL', 'https://litellm.internal.example.com/v1');
    const cfg = loadAIConfig();
    expect(cfg.litellm.baseUrl).toBe('https://litellm.internal.example.com/v1');
  });
});
