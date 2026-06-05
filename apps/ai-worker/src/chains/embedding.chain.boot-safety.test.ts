/**
 * Regression for D2 (incident-forensics-2026-06-04): the embedding chain must NOT
 * construct itself — and therefore must not read provider env via
 * createEmbeddings()/requiredProdEnv() — at module-import time. Importing this
 * module (or the @intelliflow/ai-worker barrel that re-exports it) must be
 * side-effect-free; the chain is built only on first getEmbeddingChain() call.
 *
 * Before the fix, `export const embeddingChain = new EmbeddingChain()` ran at
 * import, so importing the barrel could crash the process when provider env vars
 * were absent (e.g. AI_PROVIDER=openai with no LITELLM_BASE_URL).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { createEmbeddings } = vi.hoisted(() => ({
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([0.1]),
    embedDocuments: vi.fn().mockResolvedValue([[0.1]]),
  })),
}));

vi.mock('../lib/llm-factory', () => ({ createEmbeddings }));

describe('embedding.chain module-init safety (D2)', () => {
  beforeEach(() => {
    vi.resetModules();
    createEmbeddings.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('importing the module does not construct the chain (createEmbeddings not called at import)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('LITELLM_BASE_URL', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');

    const mod = await import('./embedding.chain.js');

    expect(createEmbeddings).not.toHaveBeenCalled();
    expect(typeof mod.getEmbeddingChain).toBe('function');
    // The old eager singleton export must be gone.
    expect((mod as Record<string, unknown>).embeddingChain).toBeUndefined();
  });

  it('getEmbeddingChain() constructs once on first call and memoizes thereafter', async () => {
    const mod = await import('./embedding.chain.js');

    const first = mod.getEmbeddingChain();
    const second = mod.getEmbeddingChain();

    expect(createEmbeddings).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });
});
