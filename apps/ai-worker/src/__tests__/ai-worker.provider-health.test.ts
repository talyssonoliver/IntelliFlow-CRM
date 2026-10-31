/**
 * Provider health branches of AIWorker.getConfiguredProviderHealth.
 *
 * Guard: every AIProviderSchema value must have a health branch. A provider
 * without one reported "Unsupported provider" and failed the combined worker's
 * Railway healthcheck in production (AI_PROVIDER=openrouter).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIWorker } from '../ai-worker';
import { aiConfig, AIProviderSchema } from '../config/ai.config';

type HealthProbe = { getConfiguredProviderHealth(lastCheck: string): unknown };

function probe(): HealthProbe {
  return Object.create(AIWorker.prototype) as HealthProbe;
}

async function healthFor(provider: string) {
  (aiConfig as { provider: string }).provider = provider;
  return (await probe().getConfiguredProviderHealth('now')) as { status: string; message: string };
}

describe('AIWorker provider health', () => {
  const originalProvider = aiConfig.provider;
  const originalOpenAI = { ...aiConfig.openai };
  const originalLiteLLM = { ...aiConfig.litellm };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    (aiConfig as { provider: string }).provider = originalProvider;
    Object.assign(aiConfig.openai, originalOpenAI);
    Object.assign(aiConfig.litellm, originalLiteLLM);
    vi.unstubAllEnvs();
  });

  it('openrouter is ok with only an API key (base URL defaults like the LLM factory)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'k'.repeat(12));
    vi.stubEnv('OPENROUTER_BASE_URL', '');

    const health = await healthFor('openrouter');

    expect(health.status).toBe('ok');
    expect(health.message).toContain('openrouter');
  });

  it('openrouter is an error with only a base URL (the key is always required)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.example.invalid/api/v1');

    const health = await healthFor('openrouter');

    expect(health.status).toBe('error');
    expect(health.message).toContain('OPENROUTER_API_KEY');
  });

  it('openrouter reports a custom base URL when the key is set', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'k'.repeat(12));
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.example.invalid/api/v1');

    const health = await healthFor('openrouter');

    expect(health.status).toBe('ok');
    expect(health.message).toContain('openrouter.example.invalid');
  });

  it('openrouter is an error when nothing is configured', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_BASE_URL', '');

    const health = await healthFor('openrouter');

    expect(health.status).toBe('error');
    expect(health.message).toContain('OPENROUTER_API_KEY');
  });

  it('probes an OpenAI-compatible provider and reports degraded when it is unreachable', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'https://litellm.example.test/v1');
    vi.stubEnv('LITELLM_MASTER_KEY', 'secret');
    (aiConfig.litellm as { baseUrl: string; masterKey: string }).baseUrl =
      'https://litellm.example.test/v1';
    (aiConfig.litellm as { baseUrl: string; masterKey: string }).masterKey = 'secret';
    (aiConfig as { provider: string }).provider = 'litellm';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const health = await healthFor('litellm');

    expect(health.status).toBe('degraded');
    expect(health.message).toContain('connection refused');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://litellm.example.test/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      })
    );
  });

  it('reports degraded for a non-successful provider response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    (aiConfig.openai as { apiKey?: string }).apiKey = 'secret';
    (aiConfig as { provider: string }).provider = 'openai';

    const health = await healthFor('openai');

    expect(health.status).toBe('degraded');
    expect(health.message).toContain('503');
  });

  it('caches compatible-provider probes for one minute', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'secret');
    vi.stubEnv('OPENAI_BASE_URL', 'https://openai.example.test/v1');
    (aiConfig.openai as { apiKey?: string; baseUrl?: string }).apiKey = 'secret';
    (aiConfig.openai as { apiKey?: string; baseUrl?: string }).baseUrl =
      'https://openai.example.test/v1';
    const fetchMock = vi.mocked(fetch);

    const worker = probe();
    (aiConfig as { provider: string }).provider = 'openai';
    await (
      worker as HealthProbe & { getOpenAIProviderHealth(lastCheck: string): Promise<unknown> }
    ).getOpenAIProviderHealth('one');
    await (
      worker as HealthProbe & { getOpenAIProviderHealth(lastCheck: string): Promise<unknown> }
    ).getOpenAIProviderHealth('two');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(AIProviderSchema.options)(
    'provider "%s" has a health branch (never "Unsupported provider")',
    async (provider) => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('OPENROUTER_API_KEY', 'k'.repeat(12));
      // ollama's branch probes the network; a refused local port is still a branch.
      (aiConfig.ollama as { baseUrl: string }).baseUrl = 'http://127.0.0.1:1';

      const health = await healthFor(provider);

      expect(health.message).not.toMatch(/Unsupported provider/);
    }
  );
});
