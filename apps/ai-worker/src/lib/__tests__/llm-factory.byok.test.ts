/**
 * createLLMForTenant with a tenant's own provider key (PG-199 BYOK): which model is built,
 * with whose key, tenant isolation, the fixed provider host, the platform path left unchanged,
 * and what happens when the customer key fails. The database and the LangChain constructors
 * are mocks; fake keys are built at runtime from repeated characters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';

const KEY_A = 'a'.repeat(30) + 'AAAA';
const KEY_B = 'b'.repeat(30) + 'BBBB';

const h = vi.hoisted(() => ({
  resolveTier: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  invokeImpl: { current: null as null | (() => Promise<unknown>) },
}));

vi.mock('../tenant-ai-config.js', () => ({
  resolveEffectiveTier: (...args: unknown[]) => h.resolveTier(...args),
  _tierCache: new Map(),
}));

vi.mock('@intelliflow/db', () => ({
  prisma: { tenantAIProviderKey: { findFirst: h.findFirst, updateMany: h.updateMany } },
}));

// Passthrough tracer that records the metering meta of every model built.
vi.mock('../../tracing/llm-tracer.js', () => ({
  wrapModelWithTracing: vi.fn((model: unknown) => model),
}));

vi.mock('@langchain/openai', () => {
  const ChatOpenAI = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    opts: Record<string, unknown>
  ) {
    Object.assign(this, opts);
    this._llmType = () => 'openai';
    this.invoke = vi.fn().mockImplementation(async () => {
      if (h.invokeImpl.current && opts['apiKey'] !== 'mock-key') return h.invokeImpl.current();
      return { content: 'platform answer' };
    });
    this.withStructuredOutput = vi.fn().mockImplementation(() => ({ invoke: this.invoke }));
  });
  const OpenAIEmbeddings = vi.fn().mockImplementation(function (this: Record<string, unknown>) {});
  return { ChatOpenAI, OpenAIEmbeddings };
});

vi.mock('@langchain/ollama', () => ({ ChatOllama: vi.fn() }));

function storedKey(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'openai',
    apiKey: KEY_A,
    last4: 'AAAA',
    createdAt: new Date(0),
    status: 'ACTIVE',
    allowFallback: false,
    ...overrides,
  };
}

async function importFactory() {
  vi.doMock('../../config/ai.config', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    aiConfig: {
      provider: 'mock',
      ollama: { baseUrl: 'http://localhost:11434', model: 'mistral' },
      litellm: { baseUrl: 'http://localhost:4000/v1', masterKey: '', timeout: 120000 },
    },
  }));
  return import('../llm-factory.js');
}

const openAiCalls = () =>
  (ChatOpenAI as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as Record<string, any>);
const byokCalls = () => openAiCalls().filter((c) => c['apiKey'] !== 'mock-key');
const platformCalls = () => openAiCalls().filter((c) => c['apiKey'] === 'mock-key');

async function traceMetas(): Promise<Record<string, unknown>[]> {
  const { wrapModelWithTracing } = await import('../../tracing/llm-tracer.js');
  return (wrapModelWithTracing as ReturnType<typeof vi.fn>).mock.calls.map(
    (c) => c[1] as Record<string, unknown>
  );
}

describe('createLLMForTenant with BYOK', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    h.invokeImpl.current = null;
    h.resolveTier.mockResolvedValue({ tier: 'free' });
    h.findFirst.mockResolvedValue(null);
    h.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a tenant without a key gets the platform model, exactly as before', async () => {
    const { createLLMForTenant } = await importFactory();
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    expect(byokCalls()).toHaveLength(0);
    expect(platformCalls()).toHaveLength(1);
    expect(platformCalls()[0]['modelName']).toBe('scoring-free');
  });

  it('routing picks the customer model: their provider, their key, their host, marked byok', async () => {
    h.findFirst.mockResolvedValue(storedKey());
    const { createLLMForTenant } = await importFactory();
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });

    expect(platformCalls()).toHaveLength(0);
    expect(byokCalls()).toHaveLength(1);
    const call = byokCalls()[0];
    expect(call['apiKey']).toBe(KEY_A);
    expect(call['modelName']).toBe('gpt-4o-mini');
    expect(call['configuration'].baseURL).toBe('https://api.openai.com/v1');
    const metas = await traceMetas();
    expect(metas.at(-1)).toMatchObject({
      byok: true,
      pricingKey: 'gpt-4o-mini',
      purpose: 'scoring',
    });
  });

  it('never sends the platform OpenAI organization or project with the customer key', async () => {
    h.findFirst.mockResolvedValue(storedKey());
    const { createLLMForTenant } = await importFactory();
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    const headers = byokCalls()[0]!['configuration'].defaultHeaders;
    expect(headers['OpenAI-Organization']).toBeNull();
    expect(headers['OpenAI-Project']).toBeNull();
  });

  it('the Claude client for a customer key uses the fixed Anthropic host and no platform auth token', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://evil.example.invalid');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'platform-token-placeholder');
    const { AnthropicChatModel } = await import('../anthropic-chat-model.js');
    const model = new AnthropicChatModel({
      model: 'claude-haiku-5-5',
      maxTokens: 100,
      timeout: 1000,
      effort: 'low',
      apiKey: KEY_A,
    });
    const client = (model as unknown as { getClient: () => Record<string, unknown> }).getClient();
    expect(client['baseURL']).toBe('https://api.anthropic.com');
    expect(client['authToken']).toBeNull();
    expect(client['apiKey']).toBe(KEY_A);
  });

  it('never lets a platform base-URL env send the customer key anywhere else', async () => {
    vi.stubEnv('OPENAI_BASE_URL', 'https://evil.example.invalid/v1');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://evil.example.invalid/v1');
    vi.stubEnv('LITELLM_BASE_URL', 'https://evil.example.invalid/v1');
    const { createLLMForTenant } = await importFactory();
    for (const provider of ['openai', 'google', 'openrouter']) {
      h.findFirst.mockResolvedValue(storedKey({ provider }));
      (await import('../byok.js')).invalidateByok();
      await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    }
    const hosts = byokCalls().map((c) => c['configuration'].baseURL as string);
    expect(hosts).toEqual([
      'https://api.openai.com/v1',
      'https://generativelanguage.googleapis.com/v1beta/openai/',
      'https://openrouter.ai/api/v1',
    ]);
  });

  it.each([
    ['openai', 'free', 'gpt-4o-mini', 'gpt-4o-mini'],
    ['openai', 'premium', 'gpt-4o', 'gpt-4o'],
    ['google', 'standard', 'gemini-2.5-flash', 'structured-free'],
    ['openrouter', 'free', 'openai/gpt-4o-mini', 'gpt-4o-mini'],
    ['anthropic', 'free', 'claude-haiku-5-5', 'claude-haiku-5-5'],
    ['anthropic', 'premium', 'claude-sonnet-5-5', 'claude-sonnet-5-5'],
  ] as const)('%s / %s runs %s priced as %s', async (provider, tier, model, pricingKey) => {
    h.findFirst.mockResolvedValue(storedKey({ provider }));
    h.resolveTier.mockResolvedValue({ tier });
    const { createLLMForTenant, byokModelSpec } = await importFactory();
    await createLLMForTenant('scoring', tier, { tenantId: 'tenant-a' });
    expect(byokModelSpec(provider, tier)).toEqual({ model, pricingKey });
    expect((await traceMetas()).at(-1)).toMatchObject({ byok: true, pricingKey });
  });

  it('the Claude model carries the customer key, not the platform one', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'platform-anthropic-placeholder');
    h.findFirst.mockResolvedValue(storedKey({ provider: 'anthropic' }));
    const { createLLMForTenant } = await importFactory();
    const model = (await createLLMForTenant('scoring', 'free', {
      tenantId: 'tenant-a',
    })) as unknown as {
      model: string;
      apiKey: string;
    };
    expect(model.model).toBe('claude-haiku-5-5');
    expect(model.apiKey).toBe(KEY_A);
  });

  it('isolates tenants: each runs its own key, a keyless tenant stays on the platform', async () => {
    h.findFirst.mockImplementation(async ({ where }: { where: { tenantId: string } }) => {
      if (where.tenantId === 'tenant-a') return storedKey();
      if (where.tenantId === 'tenant-b') return storedKey({ apiKey: KEY_B, last4: 'BBBB' });
      return null;
    });
    const { createLLMForTenant } = await importFactory();
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-b' });
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-c' });
    expect(byokCalls().map((c) => c['apiKey'])).toEqual([KEY_A, KEY_B]);
    expect(platformCalls()).toHaveLength(1);
  });

  it('caches the built model per tenant, and rebuilds when the key is replaced', async () => {
    h.findFirst.mockResolvedValue(storedKey());
    const { createLLMForTenant } = await importFactory();
    const byok = await import('../byok.js');
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    expect(byokCalls()).toHaveLength(1);

    byok.invalidateByok('tenant-a');
    h.findFirst.mockResolvedValue(storedKey({ apiKey: KEY_B, last4: 'BBBB' }));
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    expect(byokCalls().map((c) => c['apiKey'])).toEqual([KEY_A, KEY_B]);
  });

  it('ignores the tenant model pin and fallbacks: they name platform gateway models', async () => {
    h.findFirst.mockResolvedValue(storedKey());
    h.resolveTier.mockResolvedValue({
      tier: 'free',
      modelId: 'gpt-4o',
      fallbackModelIds: ['gpt-4o-mini'],
    });
    const { createLLMForTenant } = await importFactory();
    await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
    expect(platformCalls()).toHaveLength(0);
    expect(byokCalls()).toHaveLength(1);
  });

  describe('when the customer key fails', () => {
    function failWith(status: number) {
      h.invokeImpl.current = async () => {
        throw Object.assign(new Error(`provider error ${status}`), { status });
      };
    }

    it('401, fallback off: the job fails with a clear error, the credential is marked, no platform model is built', async () => {
      h.findFirst.mockResolvedValue(storedKey());
      failWith(401);
      const { createLLMForTenant } = await importFactory();
      const { ByokKeyError } = await import('../byok.js');
      const model = await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
      const err = await model.invoke('hi').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ByokKeyError);
      expect((err as Error).message).toMatch(/OpenAI API key was rejected/);
      expect(h.updateMany.mock.calls[0][0].data.status).toBe('INVALID');
      expect(platformCalls()).toHaveLength(0);
    });

    it('429, fallback on: marks RATE_LIMITED and answers from the platform model', async () => {
      h.findFirst.mockResolvedValue(storedKey({ allowFallback: true }));
      failWith(429);
      const { createLLMForTenant } = await importFactory();
      const model = await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
      await expect(model.invoke('hi')).resolves.toEqual({ content: 'platform answer' });
      expect(h.updateMany.mock.calls[0][0].data.status).toBe('RATE_LIMITED');
      expect(platformCalls()).toHaveLength(1);
    });

    it('an already-INVALID key with fallback off fails before any provider call (after its one probe)', async () => {
      h.findFirst.mockResolvedValue(storedKey({ status: 'INVALID' }));
      const { createLLMForTenant } = await importFactory();
      // The first build after a rejection is the probe; consume it.
      await (await import('../byok.js')).routeForTenant('tenant-a');
      await expect(
        createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' })
      ).rejects.toMatchObject({ code: 'BYOK_KEY_ERROR' });
      expect(openAiCalls()).toHaveLength(0);
    });

    it('an already-INVALID key with fallback on uses the platform model (after its one probe)', async () => {
      h.findFirst.mockResolvedValue(storedKey({ status: 'INVALID', allowFallback: true }));
      const { createLLMForTenant } = await importFactory();
      await (await import('../byok.js')).routeForTenant('tenant-a');
      await createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a' });
      expect(byokCalls()).toHaveLength(0);
      expect(platformCalls()).toHaveLength(1);
    });

    it('the job-level provider fallback never reaches a platform provider unless the tenant allowed it', async () => {
      h.findFirst.mockResolvedValue(storedKey());
      const { createLLMForTenant } = await importFactory();
      await expect(
        createLLMForTenant('scoring', 'free', { tenantId: 'tenant-a', provider: 'litellm' })
      ).rejects.toMatchObject({ code: 'BYOK_KEY_ERROR' });
      expect(platformCalls()).toHaveLength(0);
    });
  });
});
