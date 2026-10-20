/**
 * active-embedding-model.test.ts — PG-199 (owner Q10): the API shows the embedding model the
 * ai-worker publishes, or nothing (rendered "unavailable"), never a catalog default.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ACTIVE_EMBEDDING_MODEL_KEY,
  createActiveEmbeddingModelReader,
} from '../active-embedding-model';

describe('active embedding model reader (PG-199 Q10)', () => {
  it('pins the Redis key the ai-worker publishes to', () => {
    expect(ACTIVE_EMBEDDING_MODEL_KEY).toBe('ai-config:v1:embedding-model');
  });

  it('returns the published model', async () => {
    const get = vi.fn().mockResolvedValue('{"id":"gemini-embedding-001","dimensions":1536}');
    const read = createActiveEmbeddingModelReader({ get });
    await expect(read()).resolves.toEqual({ id: 'gemini-embedding-001', dimensions: 1536 });
    expect(get).toHaveBeenCalledWith(ACTIVE_EMBEDDING_MODEL_KEY);
  });

  it('connects a lazy client before the first read', async () => {
    const client = {
      status: 'wait',
      connect: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue('{"id":"nomic-embed-text","dimensions":768}'),
    };
    await expect(createActiveEmbeddingModelReader(client)()).resolves.toEqual({
      id: 'nomic-embed-text',
      dimensions: 768,
    });
    expect(client.connect.mock.invocationCallOrder[0]).toBeLessThan(
      client.get.mock.invocationCallOrder[0]
    );
  });

  it('returns null without Redis, for a missing key, a malformed value or a Redis error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(createActiveEmbeddingModelReader(null)()).resolves.toBeNull();
    const reader = (value: Promise<string | null>) =>
      createActiveEmbeddingModelReader({ get: () => value })();
    await expect(reader(Promise.resolve(null))).resolves.toBeNull();
    await expect(reader(Promise.resolve('not json'))).resolves.toBeNull();
    await expect(reader(Promise.resolve('{"id":""}'))).resolves.toBeNull();
    await expect(reader(Promise.reject(new Error('ECONNREFUSED')))).resolves.toBeNull();
    warn.mockRestore();
  });
});
