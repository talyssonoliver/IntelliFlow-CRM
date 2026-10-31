/**
 * embedding-model-publisher.test.ts — PG-199 (owner Q10): the worker publishes the embedding model
 * it runs, so the Model Configuration page never shows a catalog default production does not run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('active embedding model publisher (PG-199 Q10)', () => {
  const env = { ...process.env };

  async function load(provider = 'litellm') {
    vi.resetModules();
    vi.doMock('../../config/ai.config.js', async () => {
      const actual = await vi.importActual<{ aiConfig: Record<string, unknown> }>(
        '../../config/ai.config.js'
      );
      return { ...actual, aiConfig: { ...actual.aiConfig, provider } };
    });
    return import('../embedding-model-publisher.js');
  }

  beforeEach(() => {
    delete process.env['EMBEDDING_PROVIDER'];
    delete process.env['GEMINI_EMBEDDING_MODEL'];
    delete process.env['EMBEDDING_DIMENSIONS'];
  });

  afterEach(() => {
    process.env = { ...env };
    vi.doUnmock('../../config/ai.config.js');
    vi.useRealTimers();
  });

  it('pins the Redis key the API reads', async () => {
    const { ACTIVE_EMBEDDING_MODEL_KEY } = await load();
    expect(ACTIVE_EMBEDDING_MODEL_KEY).toBe('ai-config:v1:embedding-model');
  });

  it('reports Gemini with its configured dimensions when EMBEDDING_PROVIDER=gemini', async () => {
    process.env['EMBEDDING_PROVIDER'] = 'gemini';
    const { activeEmbeddingModel } = await load();
    expect(activeEmbeddingModel()).toEqual({ id: 'gemini-embedding-001', dimensions: 1536 });

    process.env['EMBEDDING_DIMENSIONS'] = '768';
    expect(activeEmbeddingModel()).toEqual({ id: 'gemini-embedding-001', dimensions: 768 });
  });

  it('reports the OpenRouter model at 2048 dimensions when EMBEDDING_PROVIDER=openrouter', async () => {
    process.env['EMBEDDING_PROVIDER'] = 'openrouter';
    delete process.env['OPENROUTER_EMBEDDING_MODEL'];
    const { activeEmbeddingModel } = await load('openrouter');
    expect(activeEmbeddingModel()).toEqual({
      id: 'nvidia/nemotron-3-embed-1b:free',
      dimensions: 2048,
    });
  });

  it('reports the LiteLLM rag-free model otherwise', async () => {
    const { activeEmbeddingModel } = await load();
    expect(activeEmbeddingModel()).toEqual({ id: 'nomic-embed-text', dimensions: 768 });
  });

  it('publishes the model with a TTL on start and on every tick', async () => {
    vi.useFakeTimers();
    process.env['EMBEDDING_PROVIDER'] = 'gemini';
    const { EmbeddingModelPublisher, ACTIVE_EMBEDDING_MODEL_KEY } = await load();
    const set = vi.fn().mockResolvedValue('OK');
    const publisher = new EmbeddingModelPublisher({ set }, 1000);

    publisher.start();
    await vi.advanceTimersByTimeAsync(2500);
    await publisher.stop();

    expect(set).toHaveBeenCalledTimes(3);
    const [key, value, mode, ttl] = set.mock.calls[0];
    expect(key).toBe(ACTIVE_EMBEDDING_MODEL_KEY);
    expect(JSON.parse(value)).toEqual({ id: 'gemini-embedding-001', dimensions: 1536 });
    expect(mode).toBe('EX');
    expect(ttl).toBeGreaterThan(0);
  });

  it('never throws when Redis is down', async () => {
    const { EmbeddingModelPublisher } = await load();
    const publisher = new EmbeddingModelPublisher({
      set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    await expect(publisher.publish()).resolves.toBeUndefined();
  });
});
