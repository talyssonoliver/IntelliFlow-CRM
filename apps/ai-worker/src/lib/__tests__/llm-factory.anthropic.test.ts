/**
 * createLLM with AI_PROVIDER=anthropic. Builds models only: no test sends a request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLLM, resolveFallbackProvider, __resetFactoryCache } from '../llm-factory';
import { AnthropicChatModel } from '../anthropic-chat-model';
import { anthropicEffort } from '../anthropic-config';
import { calculateCost } from '../../config/ai.config';

beforeEach(() => {
  __resetFactoryCache();
  vi.stubEnv('ANTHROPIC_MODEL', '');
  vi.stubEnv('ANTHROPIC_MODEL_FREE', '');
  vi.stubEnv('ANTHROPIC_MODEL_PREMIUM', '');
  vi.stubEnv('ANTHROPIC_EFFORT', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function build(tier: 'free' | 'standard' | 'premium' = 'free', maxTokens?: number) {
  return createLLM('scoring', tier, {
    provider: 'anthropic',
    ...(maxTokens ? { maxTokens } : {}),
  }) as unknown as AnthropicChatModel;
}

describe('createLLM on AI_PROVIDER=anthropic', () => {
  it('uses Claude Haiku 5.5 by default, at low effort', () => {
    const model = build();
    expect(model).toBeInstanceOf(AnthropicChatModel);
    expect(model.model).toBe('claude-haiku-5-5');
    expect(model.effort).toBe('low');
  });

  it('lets one tier move to Sonnet 5.5 while the others stay on Haiku', () => {
    vi.stubEnv('ANTHROPIC_MODEL_PREMIUM', 'claude-sonnet-5-5');
    expect(build('premium').model).toBe('claude-sonnet-5-5');
    expect(build('free').model).toBe('claude-haiku-5-5');
  });

  it('takes ANTHROPIC_MODEL for every tier without its own override', () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-sonnet-5-5');
    expect(build('standard').model).toBe('claude-sonnet-5-5');
  });

  it('raises max_tokens to leave room for thinking, and keeps a larger value', () => {
    expect(build('free').maxTokens).toBe(8000);
    __resetFactoryCache();
    expect(build('free', 12000).maxTokens).toBe(12000);
  });

  it('reads ANTHROPIC_EFFORT and ignores an unknown level', () => {
    vi.stubEnv('ANTHROPIC_EFFORT', 'medium');
    expect(anthropicEffort()).toBe('medium');
    vi.stubEnv('ANTHROPIC_EFFORT', 'turbo');
    expect(anthropicEffort()).toBe('low');
  });

  it('has no job-level fallback provider unless one is configured', () => {
    vi.stubEnv('AI_FALLBACK_PROVIDER', '');
    expect(resolveFallbackProvider()).toBeNull();
    vi.stubEnv('AI_FALLBACK_PROVIDER', 'openrouter');
    expect(resolveFallbackProvider()).toBe('openrouter');
  });
});

describe('Claude pricing', () => {
  it('prices a Haiku 5.5 call with a prompt up to 100K tokens at the standard rate', () => {
    // 100,000 in x $0.10/M + 8,000 out x $0.50/M
    expect(calculateCost('claude-haiku-5-5', 100_000, 8_000)).toBeCloseTo(0.014, 6);
  });

  it('prices a Haiku 5.5 call with a longer prompt at the long-prompt rate', () => {
    // 120,000 in x $0.50/M + 8,000 out x $2.50/M
    expect(calculateCost('claude-haiku-5-5', 120_000, 8_000)).toBeCloseTo(0.08, 6);
  });

  it('prices Sonnet 5.5 at its list price', () => {
    expect(calculateCost('claude-sonnet-5-5', 1_000_000, 1_000_000)).toBeCloseTo(12);
  });
});
