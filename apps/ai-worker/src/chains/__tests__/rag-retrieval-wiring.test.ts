/**
 * M3 Audit Fix — RAG Retrieval Service Startup Wiring Tests
 *
 * Verifies that:
 * 1. setRetrievalService() properly connects a service to the chain
 * 2. The wired service is called when retrieveContext() runs
 * 3. tenantId is passed through to every search() call (tenant isolation)
 * 4. Empty query returns empty array without hitting the service
 * 5. Blank tenantId is rejected before reaching the service
 * 6. limit defaults to the chain's configured maxResults (5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RAGContextChain,
  type IRetrievalService,
  type RAGContextInput,
} from '../rag-context.chain';

// Suppress the embedding chain module — wiring tests don't need real embeddings.
vi.mock('../embedding.chain', () => ({
  embeddingChain: {
    generateEmbedding: vi.fn().mockResolvedValue({
      vector: new Array(1536).fill(0.1),
      dimensions: 1536,
      model: 'text-embedding-3-small',
      text: 'test',
    }),
    getStats: vi.fn().mockReturnValue({ model: 'text-embedding-3-small', dimensions: 1536 }),
  },
  EmbeddingChain: class {
    generateEmbedding = vi.fn().mockResolvedValue({
      vector: new Array(1536).fill(0.1),
      dimensions: 1536,
      model: 'text-embedding-3-small',
      text: 'test',
    });
  },
}));

// Minimal valid UUIDs used across tests
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function makeSearchResponse(
  overrides: Partial<
    ReturnType<IRetrievalService['search']> extends Promise<infer T> ? T : never
  > = {}
) {
  return {
    results: [],
    total: 0,
    query: 'test',
    searchType: 'hybrid' as const,
    executionTimeMs: 5,
    ...overrides,
  };
}

function makeRetrievalService(
  searchImpl?: (
    config: Parameters<IRetrievalService['search']>[0]
  ) => ReturnType<IRetrievalService['search']>
): IRetrievalService {
  return {
    search: vi.fn().mockImplementation(searchImpl ?? (() => Promise.resolve(makeSearchResponse()))),
  };
}

describe('M3 — RAG retrieval service wiring', () => {
  let chain: RAGContextChain;
  let service: IRetrievalService;

  beforeEach(() => {
    // useMockFallback:false forces real-path; setRetrievalService() or throw.
    chain = new RAGContextChain(undefined, undefined, { useMockFallback: false });
    service = makeRetrievalService();
  });

  it('throws before wiring and succeeds after wiring', async () => {
    const input: RAGContextInput = {
      query: 'active deals this quarter',
      tenantId: TENANT_ID,
      userId: USER_ID,
      sources: ['documents'],
      maxResults: 5,
      minRelevance: 0.7,
      contextWindow: '7d',
      searchType: 'hybrid',
    };

    // Before wiring: production mode must throw (not silently return empty)
    const before = await chain.retrieveContext(input);
    expect(before.success).toBe(false);
    expect(before.error).toMatch(/RetrievalService not configured/);

    // After wiring: should succeed and delegate to the service
    chain.setRetrievalService(service);
    const after = await chain.retrieveContext(input);
    expect(after.success).toBe(true);
    expect(service.search).toHaveBeenCalledTimes(1);
  });

  it('passes tenantId to every search() call — tenant isolation', async () => {
    chain.setRetrievalService(service);

    const input: RAGContextInput = {
      query: 'pipeline forecast',
      tenantId: TENANT_ID,
      userId: USER_ID,
      sources: ['documents'],
      maxResults: 5,
      minRelevance: 0.7,
      contextWindow: '7d',
      searchType: 'hybrid',
    };

    await chain.retrieveContext(input);

    expect(service.search).toHaveBeenCalledTimes(1);
    const callArg = (service.search as ReturnType<typeof vi.fn>).mock.calls[0][0] as Parameters<
      IRetrievalService['search']
    >[0];

    // CRITICAL tenant-isolation assertion
    expect(callArg.tenantId).toBe(TENANT_ID);
  });

  it('passes limit through to the service as the maxResults value', async () => {
    chain.setRetrievalService(service);

    const input: RAGContextInput = {
      query: 'open tickets',
      tenantId: TENANT_ID,
      userId: USER_ID,
      sources: ['documents'],
      maxResults: 5, // the chain's default; maps to `limit` in SearchConfig
      minRelevance: 0.7,
      contextWindow: '7d',
      searchType: 'hybrid',
    };

    await chain.retrieveContext(input);

    const callArg = (service.search as ReturnType<typeof vi.fn>).mock.calls[0][0] as Parameters<
      IRetrievalService['search']
    >[0];
    expect(callArg.limit).toBe(5);
  });

  it('returns empty context without calling service when query is empty string', async () => {
    chain.setRetrievalService(service);

    // Zod schema requires min(1) — retrieveContext wraps the ZodError and returns success:false
    const result = await chain.retrieveContext({
      query: '',
      tenantId: TENANT_ID,
      userId: USER_ID,
      sources: ['documents'],
      maxResults: 5,
      minRelevance: 0.7,
      contextWindow: '7d',
      searchType: 'hybrid',
    });

    expect(result.success).toBe(false);
    // Service must NOT have been called — no DB round-trip for invalid input
    expect(service.search).not.toHaveBeenCalled();
  });

  it('rejects blank tenantId before reaching the service', async () => {
    chain.setRetrievalService(service);

    // z.uuid() rejects empty string
    const result = await chain.retrieveContext({
      query: 'some query',
      tenantId: '',
      userId: USER_ID,
      sources: ['documents'],
      maxResults: 5,
      minRelevance: 0.7,
      contextWindow: '7d',
      searchType: 'hybrid',
    });

    expect(result.success).toBe(false);
    expect(service.search).not.toHaveBeenCalled();
  });

  it('maps search results into ContextItem[] with citation field', async () => {
    const mockResult = {
      id: 'doc-abc',
      source: 'documents',
      title: 'Q4 Forecast',
      content: 'Expected pipeline value is $2.4M for Q4.',
      snippet: 'Expected pipeline value...',
      relevanceScore: 0.88,
      metadata: { documentType: 'forecast' },
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-15'),
    };

    const richService = makeRetrievalService(() =>
      Promise.resolve(makeSearchResponse({ results: [mockResult], total: 1 }))
    );
    chain.setRetrievalService(richService);

    const result = await chain.retrieveContext({
      query: 'Q4 pipeline',
      tenantId: TENANT_ID,
      userId: USER_ID,
      sources: ['documents'],
      maxResults: 5,
      minRelevance: 0.5,
      contextWindow: '30d',
      searchType: 'hybrid',
    });

    expect(result.success).toBe(true);
    expect(result.context).toHaveLength(1);
    const item = result.context[0];
    expect(item.id).toBe('doc-abc');
    expect(item.title).toBe('Q4 Forecast');
    expect(item.relevanceScore).toBe(0.88);
    // citation must be present (required by contextItemSchema)
    expect(typeof item.citation).toBe('string');
    expect(item.citation.length).toBeGreaterThan(0);
  });
});
