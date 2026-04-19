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

async function importFactory(provider: 'litellm' | 'mock' | 'ollama' | 'openai') {
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

  // 6. Ollama provider — tenant override still routes to Ollama (provider takes precedence)
  it('ollama provider with tenant override → ChatOllama (not ChatOpenAI)', async () => {
    mockResolveEffectiveTier.mockResolvedValue({ tier: 'premium' });

    const { createLLMForTenant } = await importFactory('ollama');
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-g' });

    expect(ChatOllama).toHaveBeenCalledOnce();
    expect(ChatOpenAI).not.toHaveBeenCalled();
  });
});
