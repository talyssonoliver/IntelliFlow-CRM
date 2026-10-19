/**
 * createLLMForTenant.test.ts
 *
 * Tests for the async tenant-aware LLM factory function.
 *
 * Scenarios:
 * 1. No tenant override → delegates to createLLM with the supplied default tier
 * 2. Tenant has 'premium' override for 'scoring' → ChatOpenAI modelName is "scoring-premium"
 * 3. Tenant has temperature override in DB → factory receives the DB temperature
 * 4. Circuit-breaker key includes effectiveTier — premium and free get separate breakers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';

// ---------------------------------------------------------------------------
// Mock resolveEffectiveTier so we can control tier resolution without DB
// ---------------------------------------------------------------------------

const mockResolveEffectiveTier = vi.hoisted(() => vi.fn());

// Stub out llm-tracer to prevent OTel import chain and model.invoke.bind errors
vi.mock('../../tracing/llm-tracer.js', () => ({
  wrapModelWithTracing: vi.fn((model: unknown) => model),
}));

vi.mock('../tenant-ai-config.js', () => ({
  resolveEffectiveTier: (...args: unknown[]) => mockResolveEffectiveTier(...args),
  _tierCache: new Map(),
}));

// Mock LangChain constructors
vi.mock('@langchain/openai', () => {
  const ChatOpenAI = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    opts: Record<string, unknown>
  ) {
    Object.assign(this, opts);
    this._llmType = () => 'openai';
  });
  const OpenAIEmbeddings = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    opts: Record<string, unknown>
  ) {
    Object.assign(this, opts);
  });
  return { ChatOpenAI, OpenAIEmbeddings };
});

vi.mock('@langchain/ollama', () => {
  const ChatOllama = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    opts: Record<string, unknown>
  ) {
    Object.assign(this, opts);
    this._llmType = () => 'ollama';
  });
  return { ChatOllama };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function importFactory(provider: 'litellm' | 'mock' | 'ollama' | 'openai' | 'openrouter') {
  vi.doMock('../../config/ai.config', () => ({
    aiConfig: {
      provider,
      ollama: { baseUrl: 'http://localhost:11434', model: 'mistral' },
      litellm: { baseUrl: 'http://localhost:4000/v1', masterKey: '', timeout: 120000 },
    },
  }));
  const mod = await import('../llm-factory.js');
  return mod;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLLMForTenant()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // 1. No DB override → same model as createLLM with supplied tier
  it('no tenant override → uses default tier (free)', async () => {
    mockResolveEffectiveTier.mockResolvedValue({ tier: 'free' });

    const { createLLMForTenant } = await importFactory('mock');
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });

    expect(ChatOpenAI).toHaveBeenCalledOnce();
    const args = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(args.modelName).toBe('scoring-free');
  });

  // 2. Tenant has 'premium' override for 'scoring' → modelName is "scoring-premium"
  it('tenant has premium override for scoring → modelName is "scoring-premium"', async () => {
    mockResolveEffectiveTier.mockResolvedValue({ tier: 'premium' });

    const { createLLMForTenant } = await importFactory('mock');
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-b' });

    const args = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(args.modelName).toBe('scoring-premium');
  });

  // 3. Tenant has temperature override in DB → factory receives the DB temperature
  it('DB row has temperature=0.05 → ChatOpenAI receives temperature=0.05', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'standard',
      temperature: 0.05,
      maxTokens: 256,
    });

    const { createLLMForTenant } = await importFactory('mock');
    await createLLMForTenant('email', 'free', { tenantId: 'tenant-c', temperature: 0.7 });

    const args = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    // DB override (0.05) should win over caller-supplied (0.7)
    expect(args.temperature).toBe(0.05);
    expect(args.maxTokens).toBe(256);
  });

  // 4. Circuit-breaker key includes effectiveTier — premium and free get separate breakers
  it('premium and free tiers produce separate circuit breakers', async () => {
    mockResolveEffectiveTier
      .mockResolvedValueOnce({ tier: 'free' })
      .mockResolvedValueOnce({ tier: 'premium' });

    const { createLLMForTenant, getLLMBreaker, __resetBreakers } = await importFactory('mock');
    __resetBreakers();

    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-d' });
    const freeBreaker = getLLMBreaker('scoring', 'free');

    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-e' });
    const premiumBreaker = getLLMBreaker('scoring', 'premium');

    // They must be distinct objects
    expect(freeBreaker).not.toBe(premiumBreaker);
  });

  // 5. resolveEffectiveTier is called with correct tenantId and purpose
  it('calls resolveEffectiveTier with the supplied tenantId and purpose', async () => {
    mockResolveEffectiveTier.mockResolvedValue({ tier: 'standard' });

    const { createLLMForTenant } = await importFactory('mock');
    await createLLMForTenant('qualification', 'free', { tenantId: 'tenant-f' });

    expect(mockResolveEffectiveTier).toHaveBeenCalledWith('tenant-f', 'qualification', 'free');
  });

  // ── PG-199: model pins, ceilings, fallback chain ────────────────────────────

  function lastChatArgs(): Record<string, unknown> {
    const calls = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1][0] as Record<string, unknown>;
  }

  it('pinned model on LiteLLM → routes to its catalog-<id> alias', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'standard',
      modelId: 'gpt-4o',
      fallbackModelIds: [],
    });

    const { createLLMForTenant } = await importFactory('litellm');
    await createLLMForTenant('qualification', 'standard', { tenantId: 'tenant-pin' });

    expect(lastChatArgs().modelName).toBe('catalog-gpt-4o');
  });

  it('pinned model on OpenRouter → uses the mapped OpenRouter id', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'premium',
      modelId: 'claude-sonnet-4-5',
      fallbackModelIds: [],
    });

    const { createLLMForTenant } = await importFactory('openrouter');
    await createLLMForTenant('reasoning', 'free', { tenantId: 'tenant-or' });

    expect(lastChatArgs().modelName).toBe('anthropic/claude-sonnet-4.5');
  });

  it('pin without an OpenRouter mapping → tier default plus a pin_unavailable_for_provider warning', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'standard',
      modelId: 'mistral-small',
      fallbackModelIds: [],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { createLLMForTenant } = await importFactory('openrouter');
    await createLLMForTenant('scoring', 'standard', { tenantId: 'tenant-or2' });

    expect(lastChatArgs().modelName).toBe('openai/gpt-oss-120b:free');
    expect(warn.mock.calls.some((c) => String(c[0]).includes('pin_unavailable_for_provider'))).toBe(
      true
    );
    warn.mockRestore();
  });

  it('Ollama ignores pins (one local model)', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'premium',
      modelId: 'gpt-4o',
      fallbackModelIds: [],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { createLLMForTenant } = await importFactory('ollama');
    await createLLMForTenant('qualification', 'free', { tenantId: 'tenant-ol' });

    expect((ChatOllama as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      model: 'mistral',
    });
    warn.mockRestore();
  });

  it('distinct pins get distinct cached instances (model is part of the cache key)', async () => {
    mockResolveEffectiveTier
      .mockResolvedValueOnce({ tier: 'standard', modelId: 'gpt-4o', fallbackModelIds: [] })
      .mockResolvedValueOnce({ tier: 'standard', modelId: 'mistral-medium', fallbackModelIds: [] });

    const { createLLMForTenant } = await importFactory('litellm');
    const a = await createLLMForTenant('qualification', 'standard', { tenantId: 't-a' });
    const b = await createLLMForTenant('qualification', 'standard', { tenantId: 't-b' });

    expect(a).not.toBe(b);
  });

  it('keys circuit breakers by model when one is given', async () => {
    const { getLLMBreaker, __resetBreakers } = await importFactory('mock');
    __resetBreakers();
    expect(getLLMBreaker('scoring', 'free', 'gpt-4o-mini')).not.toBe(
      getLLMBreaker('scoring', 'free')
    );
    expect(getLLMBreaker('scoring', 'free', 'gpt-4o-mini')).toBe(
      getLLMBreaker('scoring', 'free', 'gpt-4o-mini')
    );
  });

  it('a pin outside the catalog uses the first tenant fallback instead', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'premium',
      modelId: 'gpt-4-turbo-preview',
      fallbackModelIds: ['claude-haiku-4-5'],
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { createLLMForTenant } = await importFactory('litellm');
    await createLLMForTenant('reasoning', 'free', { tenantId: 'tenant-ret' });

    expect(lastChatArgs().modelName).toBe('catalog-claude-haiku-4-5');
    expect(err.mock.calls.some((c) => String(c[0]).includes('pin_retired'))).toBe(true);
    err.mockRestore();
  });

  it('a pin outside the catalog with no fallbacks uses the caller default and logs it', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'free',
      modelId: 'gpt-4-turbo-preview',
      fallbackModelIds: [],
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { createLLMForTenant } = await importFactory('litellm');
    await createLLMForTenant('reasoning', 'free', { tenantId: 'tenant-ret2' });

    expect(lastChatArgs().modelName).toBe('reasoning-free');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('blocks a purpose at its monthly ceiling before any model is built', async () => {
    mockResolveEffectiveTier.mockResolvedValue({ tier: 'free', ceilingCents: 100 });

    const { createLLMForTenant } = await importFactory('mock');
    const ceiling = await import('../purpose-ceiling.js');
    ceiling.setPurposeSpendReader({ getSpend: vi.fn().mockResolvedValue({ email: 10_000 }) });

    await expect(
      createLLMForTenant('email', 'free', { tenantId: 'tenant-cap' })
    ).rejects.toMatchObject({
      code: 'PURPOSE_CEILING_REACHED',
      message: 'monthly AI ceiling reached for email',
    });
    expect(ChatOpenAI).not.toHaveBeenCalled();
    ceiling.setPurposeSpendReader(null);
  });

  describe('withModelFallbacks (tenant fallback chain)', () => {
    function fake(name: string, behaviour: () => unknown) {
      const run = vi.fn(async () => behaviour());
      return {
        name,
        invoke: run,
        withStructuredOutput: vi.fn(() => ({ invoke: run })),
      };
    }
    const rateLimited = () => {
      throw Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    };

    it('returns the primary untouched when there are no fallbacks', async () => {
      const { withModelFallbacks } = await importFactory('mock');
      const primary = fake('p', () => 'ok');
      expect(withModelFallbacks(primary as never, [])).toBe(primary);
    });

    it('moves to the next model on 429/5xx/timeout and returns its answer', async () => {
      const { withModelFallbacks } = await importFactory('mock');
      const primary = fake('p', rateLimited);
      const second = fake('s', () => {
        throw Object.assign(new Error('upstream 503'), { status: 503 });
      });
      const third = fake('t', () => 'from fallback 2');
      const chained = withModelFallbacks(primary as never, [second, third] as never);
      await expect(chained.invoke('hi')).resolves.toBe('from fallback 2');
      expect(primary.invoke).toHaveBeenCalledTimes(1);
      expect(second.invoke).toHaveBeenCalledTimes(1);
      expect(third.invoke).toHaveBeenCalledTimes(1);
    });

    it('keeps the fallback chain for structured output (the chains call withStructuredOutput)', async () => {
      const { withModelFallbacks } = await importFactory('mock');
      const primary = fake('p', rateLimited);
      const backup = fake('b', () => ({ score: 7 }));
      const chained = withModelFallbacks(primary as never, [backup] as never);
      const structured = chained.withStructuredOutput({} as never);
      await expect(structured.invoke('score this')).resolves.toEqual({ score: 7 });
      expect(primary.withStructuredOutput).toHaveBeenCalled();
      expect(backup.withStructuredOutput).toHaveBeenCalled();
    });

    it('moves on when the primary breaker is open', async () => {
      const { withModelFallbacks } = await importFactory('mock');
      const primary = fake('p', () => {
        throw new Error('Circuit breaker is OPEN');
      });
      const backup = fake('b', () => 'backup');
      const chained = withModelFallbacks(primary as never, [backup] as never);
      await expect(chained.invoke('x')).resolves.toBe('backup');
    });

    it('does not retry errors that another model cannot fix (e.g. 400 or the ceiling)', async () => {
      const { withModelFallbacks } = await importFactory('mock');
      const primary = fake('p', () => {
        throw Object.assign(new Error('400 bad request'), { status: 400 });
      });
      const backup = fake('b', () => 'never');
      const chained = withModelFallbacks(primary as never, [backup] as never);
      await expect(chained.invoke('x')).rejects.toThrow('400 bad request');
      expect(backup.invoke).not.toHaveBeenCalled();
    });

    it('stops after the last model and rethrows its error (attempt cap = 1 + fallbacks)', async () => {
      const { withModelFallbacks } = await importFactory('mock');
      const primary = fake('p', rateLimited);
      const backup = fake('b', () => {
        throw Object.assign(new Error('request timed out'), { name: 'TimeoutError' });
      });
      const chained = withModelFallbacks(primary as never, [backup] as never);
      await expect(chained.invoke('x')).rejects.toThrow('request timed out');
      expect(primary.invoke).toHaveBeenCalledTimes(1);
      expect(backup.invoke).toHaveBeenCalledTimes(1);
    });
  });

  it('builds the tenant fallback chain from the resolved fallback ids', async () => {
    mockResolveEffectiveTier.mockResolvedValue({
      tier: 'premium',
      modelId: 'claude-sonnet-4-5',
      fallbackModelIds: ['claude-haiku-4-5', 'gpt-oss-20b-free'],
    });

    const { createLLMForTenant } = await importFactory('litellm');
    await createLLMForTenant('reasoning', 'free', { tenantId: 'tenant-fb' });

    const names = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).modelName
    );
    expect(names).toEqual([
      'catalog-claude-sonnet-4-5',
      'catalog-claude-haiku-4-5',
      'catalog-gpt-oss-20b-free',
    ]);
  });

  // 6. Ollama provider — tenant override still routes to Ollama (provider takes precedence)
  it('ollama provider with tenant override → ChatOllama (not ChatOpenAI)', async () => {
    mockResolveEffectiveTier.mockResolvedValue({ tier: 'premium' });

    const { createLLMForTenant } = await importFactory('ollama');
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-g' });

    expect(ChatOllama).toHaveBeenCalledOnce();
    expect(ChatOpenAI).not.toHaveBeenCalled();
  });
});
