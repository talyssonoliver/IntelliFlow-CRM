/**
 * Coverage for the embedder-dependent EmbeddingChain methods + the lazy
 * getEmbeddingChain() accessor (D2 / #264).
 *
 * The sibling embedding.chain.test.ts only exercises the pure helpers
 * (calculateSimilarity / chunkText / pgvector format) because the real
 * createEmbeddings('free') returns a network-backed OpenAIEmbeddings and the
 * test env has no LiteLLM proxy. Here we mock the llm-factory so the embedder
 * methods (generateEmbedding / generateBatchEmbeddings / embedDocument /
 * findMostSimilar) run fully offline and deterministically — which also lets
 * this file (and rag-context.chain.ts) be removed from the coverage-exclude
 * list so Sonar new_coverage can see the lazy-init lines.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const embedQuery = vi.fn(async () => [1, 0, 0]);
// First document aligns with the query vector, the rest are orthogonal, so the
// findMostSimilar ranking is deterministic.
const embedDocuments = vi.fn(async (texts: string[]) =>
  texts.map((_t, i) => (i === 0 ? [1, 0, 0] : [0, 1, 0]))
);

vi.mock('../lib/llm-factory', () => ({
  createEmbeddings: vi.fn(() => ({ embedQuery, embedDocuments })),
}));

import { EmbeddingChain, getEmbeddingChain } from './embedding.chain';

describe('EmbeddingChain embedder methods (mocked llm-factory)', () => {
  let chain: EmbeddingChain;

  beforeEach(() => {
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.EMBEDDING_DIMENSIONS = '1536';
    embedQuery.mockClear();
    embedDocuments.mockClear();
    embedQuery.mockResolvedValue([1, 0, 0]);
    embedDocuments.mockImplementation(async (texts: string[]) =>
      texts.map((_t, i) => (i === 0 ? [1, 0, 0] : [0, 1, 0]))
    );
    chain = new EmbeddingChain();
  });

  describe('generateEmbedding', () => {
    it('returns a structured EmbeddingResult', async () => {
      const result = await chain.generateEmbedding({ text: 'hello', metadata: { a: 1 } });

      expect(embedQuery).toHaveBeenCalledWith('hello');
      expect(result.vector).toEqual([1, 0, 0]);
      expect(result.dimensions).toBe(3);
      expect(result.model).toBe('text-embedding-3-small');
      expect(result.text).toBe('hello');
      expect(result.metadata).toEqual({ a: 1 });
    });

    it('wraps embedder errors with a descriptive message', async () => {
      embedQuery.mockRejectedValueOnce(new Error('upstream 500'));

      await expect(chain.generateEmbedding({ text: 'boom' })).rejects.toThrow(
        /Failed to generate embedding: upstream 500/
      );
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('returns one EmbeddingResult per input with batch metadata', async () => {
      const result = await chain.generateBatchEmbeddings([{ text: 'a' }, { text: 'b' }]);

      expect(embedDocuments).toHaveBeenCalledWith(['a', 'b']);
      expect(result.totalProcessed).toBe(2);
      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0].text).toBe('a');
      expect(typeof result.duration).toBe('number');
    });

    it('wraps batch embedder errors', async () => {
      embedDocuments.mockRejectedValueOnce(new Error('batch down'));

      await expect(chain.generateBatchEmbeddings([{ text: 'x' }])).rejects.toThrow(
        /Failed to generate batch embeddings: batch down/
      );
    });
  });

  describe('embedDocument', () => {
    it('chunks long text and returns an embedding per chunk', async () => {
      const text = 'word '.repeat(600); // > default chunkSize 1000 chars
      const results = await chain.embedDocument({ text, chunkSize: 100, chunkOverlap: 20 });

      expect(results.length).toBeGreaterThan(1);
      expect(embedDocuments).toHaveBeenCalledTimes(1);
      // chunk metadata is threaded through
      const callArg = embedDocuments.mock.calls[0][0] as string[];
      expect(callArg.length).toBe(results.length);
    });

    it('returns a single embedding for text smaller than the chunk size', async () => {
      const results = await chain.embedDocument({ text: 'tiny', chunkSize: 1000 });
      expect(results).toHaveLength(1);
    });
  });

  describe('findMostSimilar', () => {
    it('ranks documents by cosine similarity and applies topK', async () => {
      const result = await chain.findMostSimilar({
        query: 'q',
        documents: [{ text: 'aligned' }, { text: 'orthogonal' }],
        topK: 1,
      });

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('aligned'); // similarity 1 beats 0
      expect(result[0].similarity).toBeCloseTo(1);
    });

    it('defaults topK to 5 when not provided', async () => {
      embedDocuments.mockResolvedValueOnce([
        [1, 0, 0],
        [0, 1, 0],
      ]);
      const result = await chain.findMostSimilar({
        query: 'q',
        documents: [{ text: 'a' }, { text: 'b' }],
      });
      expect(result.length).toBe(2);
    });
  });

  describe('calculateSimilarity zero-vector branch', () => {
    it('returns 0 when either vector has zero magnitude', () => {
      expect(chain.calculateSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
      expect(chain.calculateSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    });
  });

  describe('getEmbeddingChain (lazy singleton)', () => {
    it('constructs once and memoizes on subsequent calls', () => {
      const first = getEmbeddingChain();
      const second = getEmbeddingChain();
      expect(first).toBeInstanceOf(EmbeddingChain);
      expect(first).toBe(second);
    });
  });
});
