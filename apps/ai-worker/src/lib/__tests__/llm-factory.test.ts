/**
 * llm-factory.test.ts
 *
 * Tests for createLLM() and createEmbeddings() factory functions.
 *
 * Mocking strategy:
 *  - @langchain/openai  → reuses test/mocks/langchain-openai.mock.ts pattern
 *  - @langchain/ollama  → reuses test/mocks/ollama.mock.ts pattern
 *  - ai.config          → overridden per test via vi.doMock / module re-import
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';

// ---------------------------------------------------------------------------
// Module-level mocks (vi.mock is hoisted above imports by Vitest, so the
// imports above receive the mocked classes automatically).
// ---------------------------------------------------------------------------

// Stub out @intelliflow/db to prevent Prisma client initialization (DMMF not
// available in test without a real database). tenant-ai-config.ts imports prisma.
vi.mock('@intelliflow/db', () => ({
  prisma: {
    tenantAIConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

// Stub out llm-tracer to prevent OTel import chain
vi.mock('../../tracing/llm-tracer.js', () => ({
  wrapModelWithTracing: vi.fn((model: unknown) => model),
  wrapEmbeddingsWithTracing: vi.fn((embeddings: unknown) => embeddings),
}));

// Stub out circuit-breaker so it never pulls in logger → @intelliflow/observability
vi.mock('../../utils/circuit-breaker.js', () => {
  const CircuitBreaker = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.isOpen = () => false;
    this.recordFailure = vi.fn();
    this.recordSuccess = vi.fn();
  });
  return { CircuitBreaker };
});

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

/** Re-import the factory with a specific aiConfig provider value. */
async function importFactory(provider: 'litellm' | 'openai' | 'ollama' | 'mock') {
  vi.doMock('../../config/ai.config', () => ({
    aiConfig: {
      provider,
      ollama: { baseUrl: 'http://localhost:11434', model: 'mistral' },
      litellm: {
        baseUrl: 'http://localhost:4000/v1',
        masterKey: '',
        timeout: 120000,
      },
    },
  }));
  // Dynamic import picks up the freshly doMock'd config.
  const mod = await import('../llm-factory.js');
  return mod;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLLM()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // (a) Mock path returns a ChatOpenAI instance pointed at the mock baseURL
  it('mock provider → returns ChatOpenAI with mock baseURL', async () => {
    const { createLLM } = await importFactory('mock');
    const model = createLLM('scoring', 'free');

    expect(ChatOpenAI).toHaveBeenCalledOnce();
    const callArgs = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs.apiKey).toBe('mock-key');
    expect((callArgs.configuration as Record<string, unknown>).baseURL).toBe('http://mock-litellm');
    expect(model).toBeDefined();
  });

  // (b) Ollama path returns a ChatOllama instance
  it('ollama provider → returns ChatOllama', async () => {
    const { createLLM } = await importFactory('ollama');
    const model = createLLM('rag', 'free');

    expect(ChatOllama).toHaveBeenCalledOnce();
    expect(ChatOpenAI).not.toHaveBeenCalled();
    expect(model).toBeDefined();
  });

  // (c) Default (litellm) path reads LITELLM_BASE_URL from env
  it('litellm provider → uses LITELLM_BASE_URL env var', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'http://my-litellm-proxy:4000/v1');
    vi.stubEnv('LITELLM_MASTER_KEY', 'sk-test-key');
    const { createLLM } = await importFactory('litellm');
    createLLM('reasoning', 'premium');

    expect(ChatOpenAI).toHaveBeenCalledOnce();
    const callArgs = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect((callArgs.configuration as Record<string, unknown>).baseURL).toBe(
      'http://my-litellm-proxy:4000/v1'
    );
    expect(callArgs.apiKey).toBe('sk-test-key');
  });

  // (c continued) Falls back to localhost:4000 when env vars are absent
  it('litellm provider → falls back to http://localhost:4000/v1 when LITELLM_BASE_URL unset', async () => {
    vi.stubEnv('LITELLM_BASE_URL', '');
    const { createLLM } = await importFactory('litellm');
    createLLM('email', 'standard');

    const callArgs = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect((callArgs.configuration as Record<string, unknown>).baseURL).toBe(
      'http://localhost:4000/v1'
    );
  });

  // (d) Purpose + tier compose into the correct modelName string
  it('maps purpose + tier to "${purpose}-${tier}" modelName', async () => {
    const { createLLM } = await importFactory('litellm');
    createLLM('qualification', 'premium');

    const callArgs = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs.modelName).toBe('qualification-premium');
  });

  it('default tier is "free"', async () => {
    const { createLLM } = await importFactory('litellm');
    createLLM('structured');

    const callArgs = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs.modelName).toBe('structured-free');
  });

  // Options forwarding
  it('forwards temperature, maxTokens, timeout to ChatOpenAI', async () => {
    const { createLLM } = await importFactory('litellm');
    createLLM('scoring', 'standard', { temperature: 0.2, maxTokens: 500, timeout: 30_000 });

    const callArgs = (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs.temperature).toBe(0.2);
    expect(callArgs.maxTokens).toBe(500);
    expect(callArgs.timeout).toBe(30_000);
  });

  // legacy 'openai' provider also routes through LiteLLM path (primary branch)
  it('openai provider (legacy) → routes through LiteLLM ChatOpenAI path', async () => {
    const { createLLM } = await importFactory('openai');
    createLLM('rag', 'free');

    expect(ChatOpenAI).toHaveBeenCalledOnce();
    expect(ChatOllama).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LLM Instance Cache
// ---------------------------------------------------------------------------

describe('createLLM() — instance cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the SAME instance on repeated calls with identical args', async () => {
    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    const a = createLLM('scoring', 'free');
    const b = createLLM('scoring', 'free');

    expect(a).toBe(b);
    // ChatOpenAI constructor called only once despite two createLLM calls
    expect(ChatOpenAI).toHaveBeenCalledTimes(1);
  });

  it('returns DIFFERENT instances for different purposes', async () => {
    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    const a = createLLM('scoring', 'free');
    const b = createLLM('email', 'free');

    expect(a).not.toBe(b);
    expect(ChatOpenAI).toHaveBeenCalledTimes(2);
  });

  it('returns DIFFERENT instances for different tiers', async () => {
    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    const a = createLLM('scoring', 'free');
    const b = createLLM('scoring', 'premium');

    expect(a).not.toBe(b);
    expect(ChatOpenAI).toHaveBeenCalledTimes(2);
  });

  it('returns DIFFERENT instances when temperature differs', async () => {
    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    const a = createLLM('reasoning', 'standard', { temperature: 0.2 });
    const b = createLLM('reasoning', 'standard', { temperature: 0.8 });

    expect(a).not.toBe(b);
    expect(ChatOpenAI).toHaveBeenCalledTimes(2);
  });

  it('__resetFactoryCache clears the cache so next call allocates a new instance', async () => {
    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    const a = createLLM('scoring', 'free');
    __resetFactoryCache();
    const b = createLLM('scoring', 'free');

    expect(a).not.toBe(b);
    expect(ChatOpenAI).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Production startup assertion
// ---------------------------------------------------------------------------

describe('createLLM() — production LITELLM_MASTER_KEY assertion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws in production when LITELLM_MASTER_KEY is the dev placeholder', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LITELLM_MASTER_KEY', 'sk-litellm-dev-change-me');

    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    expect(() => createLLM('scoring', 'free')).toThrowError(
      'LITELLM_MASTER_KEY must be set to a real value in production'
    );
  });

  it('throws in production when LITELLM_MASTER_KEY is absent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LITELLM_MASTER_KEY', '');

    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    expect(() => createLLM('scoring', 'free')).toThrowError(
      'LITELLM_MASTER_KEY must be set to a real value in production'
    );
  });

  it('does NOT throw in production with a real key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LITELLM_MASTER_KEY', 'sk-real-prod-key-abc123');

    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    expect(() => createLLM('scoring', 'free')).not.toThrow();
  });

  it('does NOT throw outside production even with dev placeholder key', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LITELLM_MASTER_KEY', 'sk-litellm-dev-change-me');

    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    expect(() => createLLM('scoring', 'free')).not.toThrow();
  });

  it('assertion runs only once per module lifetime (second call does not re-throw)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LITELLM_MASTER_KEY', 'sk-real-prod-key-xyz');

    const { createLLM, __resetFactoryCache } = await importFactory('litellm');
    __resetFactoryCache();

    // First call checks key, second call skips the check (cache is keyed)
    expect(() => createLLM('scoring', 'free')).not.toThrow();
    expect(() => createLLM('email', 'standard')).not.toThrow();
  });
});

describe('createEmbeddings()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mock provider → returns OpenAIEmbeddings with mock baseURL', async () => {
    const { createEmbeddings } = await importFactory('mock');
    createEmbeddings('free');

    expect(OpenAIEmbeddings).toHaveBeenCalledOnce();
    const callArgs = (OpenAIEmbeddings as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect((callArgs.configuration as Record<string, unknown>).baseURL).toBe('http://mock-litellm');
  });

  it('litellm provider → uses LITELLM_BASE_URL for embeddings', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'http://embed-proxy:4000/v1');
    const { createEmbeddings } = await importFactory('litellm');
    createEmbeddings('standard');

    const callArgs = (OpenAIEmbeddings as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect((callArgs.configuration as Record<string, unknown>).baseURL).toBe(
      'http://embed-proxy:4000/v1'
    );
    expect(callArgs.modelName).toBe('rag-standard');
  });

  it('default tier is "free" → modelName rag-free', async () => {
    const { createEmbeddings } = await importFactory('litellm');
    createEmbeddings();

    const callArgs = (OpenAIEmbeddings as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs.modelName).toBe('rag-free');
  });
});
