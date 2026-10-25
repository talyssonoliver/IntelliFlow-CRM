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

  afterEach(() => {
    (aiConfig as { provider: string }).provider = originalProvider;
    vi.unstubAllEnvs();
  });

  it('openrouter is ok with only an API key (base URL defaults like the LLM factory)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'k'.repeat(12));
    vi.stubEnv('OPENROUTER_BASE_URL', '');

    const health = await healthFor('openrouter');

    expect(health.status).toBe('ok');
    expect(health.message).toContain('openrouter');
  });

  it('openrouter is ok with only a base URL', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.example.invalid/api/v1');

    const health = await healthFor('openrouter');

    expect(health.status).toBe('ok');
    expect(health.message).toContain('openrouter.example.invalid');
  });

  it('openrouter is an error when neither key nor base URL is configured', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_BASE_URL', '');

    const health = await healthFor('openrouter');

    expect(health.status).toBe('error');
    expect(health.message).toContain('OPENROUTER_API_KEY');
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
