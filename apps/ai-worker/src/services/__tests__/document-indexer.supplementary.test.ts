import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../chains/embedding.chain', () => {
  const EmbeddingChain = vi.fn();
  EmbeddingChain.prototype.generateEmbedding = vi
    .fn()
    .mockResolvedValue({
      vector: Array(1536).fill(0.1),
      dimensions: 1536,
      model: 'text-embedding-3-small',
    });
  EmbeddingChain.prototype.generateBatchEmbeddings = vi
    .fn()
    .mockResolvedValue({
      embeddings: [
        { vector: Array(1536).fill(0.1), dimensions: 1536, model: 'text-embedding-3-small' },
      ],
    });
  return { EmbeddingChain };
});

import {
  DocumentIndexer,
  createDocumentIndexer,
  EmbeddingChainAdapter,
  IndexerConfigSchema,
  DEFAULT_INDEXER_CONFIG,
} from '../document-indexer';
import { EmbeddingChain } from '../../chains/embedding.chain';

const mp = {
  caseDocument: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  contactNote: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
};

describe('DocumentIndexer supplementary', () => {
  let idx: DocumentIndexer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup prototype mocks after mockReset
    (EmbeddingChain as any).prototype.generateEmbedding = vi
      .fn()
      .mockResolvedValue({
        vector: Array(1536).fill(0.1),
        dimensions: 1536,
        model: 'text-embedding-3-small',
      });
    (EmbeddingChain as any).prototype.generateBatchEmbeddings = vi
      .fn()
      .mockResolvedValue({
        embeddings: [
          { vector: Array(1536).fill(0.1), dimensions: 1536, model: 'text-embedding-3-small' },
        ],
      });
    process.env.MOCK_EMBEDDINGS = 'true';
    process.env.NODE_ENV = 'test';
    idx = createDocumentIndexer(mp as any, { maxConcurrent: 2 });
  });

  afterEach(() => {
    delete process.env.MOCK_EMBEDDINGS;
  });

  it('IndexerConfigSchema validates defaults', () => {
    expect(IndexerConfigSchema.parse({}).batchSize).toBe(10);
  });
  it('IndexerConfigSchema rejects invalid batchSize', () => {
    expect(() => IndexerConfigSchema.parse({ batchSize: 0 })).toThrow();
  });
  it('IndexerConfigSchema rejects invalid model', () => {
    expect(() => IndexerConfigSchema.parse({ embeddingModel: 'invalid' })).toThrow();
  });
  it('DEFAULT_INDEXER_CONFIG has fields', () => {
    expect(DEFAULT_INDEXER_CONFIG.batchSize).toBe(10);
    expect(DEFAULT_INDEXER_CONFIG.retryAttempts).toBe(3);
  });
  it('indexDocument fails when not found', async () => {
    mp.$queryRaw.mockResolvedValue([]);
    const r = await idx.indexDocument('x');
    expect(r.success).toBe(false);
  });
  it('indexDocument succeeds', async () => {
    mp.$queryRaw.mockResolvedValue([
      { id: 'd', title: 'T', description: 'D', extracted_text: 'E', tags: ['a'] },
    ]);
    mp.$executeRaw.mockResolvedValue(1);
    expect((await idx.indexDocument('d')).success).toBe(true);
  });
  it('indexDocument handles nulls', async () => {
    mp.$queryRaw.mockResolvedValue([
      { id: 'd', title: 'T', description: null, extracted_text: null, tags: [] },
    ]);
    mp.$executeRaw.mockResolvedValue(1);
    expect((await idx.indexDocument('d')).success).toBe(true);
  });
  it('indexDocument fails on error', async () => {
    mp.$queryRaw.mockRejectedValue(new Error('DB'));
    expect((await idx.indexDocument('x')).success).toBe(false);
  });
  it('indexBatch processes chunks', async () => {
    mp.$queryRaw.mockResolvedValue([
      { id: 'x', title: 'D', description: null, extracted_text: 't', tags: [] },
    ]);
    mp.$executeRaw.mockResolvedValue(1);
    expect((await idx.indexBatch(['a', 'b', 'c', 'd', 'e'])).total).toBe(5);
  });
  it('indexBatch handles empty', async () => {
    expect((await idx.indexBatch([])).total).toBe(0);
  });
  it('indexBatch counts failures', async () => {
    mp.$queryRaw
      .mockResolvedValueOnce([
        { id: 'a', title: 'D', description: null, extracted_text: 't', tags: [] },
      ])
      .mockResolvedValueOnce([]);
    mp.$executeRaw.mockResolvedValue(1);
    const r = await idx.indexBatch(['a', 'b']);
    expect(r.successful).toBe(1);
    expect(r.failed).toBe(1);
  });
  it('indexNotesBatch works', async () => {
    mp.contactNote.findUnique
      .mockResolvedValueOnce({ id: 'n1', content: 'N1' })
      .mockResolvedValueOnce({ id: 'n2', content: 'N2' });
    mp.$executeRaw.mockResolvedValue(1);
    expect((await idx.indexNotesBatch(['n1', 'n2'])).total).toBe(2);
  });
  it('reindexAll reports progress', async () => {
    mp.caseDocument.count.mockResolvedValue(2);
    mp.caseDocument.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    mp.$queryRaw.mockResolvedValue([
      { id: 'x', title: 'D', description: null, extracted_text: 't', tags: [] },
    ]);
    mp.$executeRaw.mockResolvedValue(1);
    const p: any[] = [];
    await idx.reindexAll(undefined, (x) => p.push({ ...x }));
    expect(p.length).toBeGreaterThan(0);
  });
  it('reindexAll filters by tenant', async () => {
    mp.caseDocument.count.mockResolvedValue(1);
    mp.caseDocument.findMany.mockResolvedValue([{ id: 'a' }]);
    mp.$queryRaw.mockResolvedValue([
      { id: 'a', title: 'D', description: null, extracted_text: 't', tags: [] },
    ]);
    mp.$executeRaw.mockResolvedValue(1);
    await idx.reindexAll('t1');
    expect(mp.caseDocument.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenant_id: 't1' }) })
    );
  });
  it('getIndexStats zero counts', async () => {
    mp.caseDocument.count.mockResolvedValue(0);
    mp.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
    mp.contactNote.count.mockResolvedValue(0);
    mp.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
    expect((await idx.getIndexStats()).documents.unindexed).toBe(0);
  });
  it('getIndexStats empty query', async () => {
    mp.caseDocument.count.mockResolvedValue(5);
    mp.$queryRaw.mockResolvedValueOnce([]);
    mp.contactNote.count.mockResolvedValue(3);
    mp.$queryRaw.mockResolvedValueOnce([]);
    expect((await idx.getIndexStats()).documents.indexed).toBe(0);
  });
  it('EmbeddingChainAdapter generateEmbedding', async () => {
    const mc = {
      generateEmbedding: vi.fn().mockResolvedValue({ vector: [0.1], dimensions: 1, model: 't' }),
      generateBatchEmbeddings: vi.fn(),
    };
    expect((await new EmbeddingChainAdapter(mc as any).generateEmbedding('t')).vector).toEqual([
      0.1,
    ]);
  });
  it('EmbeddingChainAdapter batch', async () => {
    const mc = {
      generateEmbedding: vi.fn(),
      generateBatchEmbeddings: vi
        .fn()
        .mockResolvedValue({ embeddings: [{ vector: [0.1], dimensions: 1, model: 'm' }] }),
    };
    expect(await new EmbeddingChainAdapter(mc as any).generateBatchEmbeddings(['t'])).toHaveLength(
      1
    );
  });
  it('production path uses real provider', async () => {
    delete process.env.MOCK_EMBEDDINGS;
    const o = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const pi = createDocumentIndexer(mp as any);
    mp.$queryRaw.mockResolvedValue([
      { id: 'dp', title: 'P', description: 'd', extracted_text: 't', tags: [] },
    ]);
    mp.$executeRaw.mockResolvedValue(1);
    expect((await pi.indexDocument('dp')).success).toBe(true);
    process.env.NODE_ENV = o;
  });
});
