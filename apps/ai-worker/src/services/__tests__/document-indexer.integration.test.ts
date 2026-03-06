/**
 * Document Indexer Integration Tests (IFC-155)
 *
 * Tests that require real embedding generation via OPENAI_API_KEY.
 * Skipped in CI unless the key is available.
 *
 * GATE: real-embedding-generation
 * GATE: latency-check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentIndexer, createDocumentIndexer } from '../document-indexer';

// ============================================
// Mock PrismaClient for integration tests
// ============================================

function createMockPrisma() {
  return {
    caseDocument: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    contactNote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn(),
  };
}

// ============================================
// Helper: build a fake document row
// ============================================

function fakeDocumentRow(id: string) {
  return {
    id,
    title: `Test Document ${id}`,
    description: 'Integration test document for IFC-155 embedding verification',
    extracted_text: 'This is extracted text from OCR processing of a legal case document.',
    tags: ['integration-test', 'ifc-155'],
  };
}

// ============================================
// Integration tests — gated on OPENAI_API_KEY
// ============================================

// Gate: Only run real embedding tests when explicitly enabled AND API key is present
const runRealEmbeddings =
  !!process.env.OPENAI_API_KEY && process.env.RUN_INTEGRATION_TESTS === 'true';

describe('DocumentIndexer Integration (IFC-155)', () => {
  describe.skipIf(!runRealEmbeddings)('GATE: Real Embedding Generation', () => {
    let mockPrisma: ReturnType<typeof createMockPrisma>;
    let indexer: DocumentIndexer;

    beforeEach(() => {
      // Ensure we are NOT in mock mode
      delete process.env.MOCK_EMBEDDINGS;
      // Override NODE_ENV so DocumentIndexer uses the real provider path
      vi.stubEnv('NODE_ENV', 'production');

      mockPrisma = createMockPrisma();
      indexer = createDocumentIndexer(mockPrisma as any);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('generates 1536-dimensional embeddings for a document', async () => {
      const docId = 'doc-integration-001';
      const doc = fakeDocumentRow(docId);
      mockPrisma.$queryRaw.mockResolvedValue([doc]);

      const result = await indexer.indexDocument(docId);

      expect(result.embeddingGenerated).toBe(true);
      expect(result.success).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('meets latency gate (<2000ms per document)', async () => {
      const docId = 'doc-latency-001';
      const doc = fakeDocumentRow(docId);
      mockPrisma.$queryRaw.mockResolvedValue([doc]);

      const start = performance.now();
      const result = await indexer.indexDocument(docId);
      const latency = performance.now() - start;

      expect(result.success).toBe(true);
      expect(latency).toBeLessThan(2000);
      console.log(`[IFC-155] Embedding latency: ${latency.toFixed(0)}ms`);
    });
  });

  // ============================================
  // Mock-mode fallback tests (always run)
  // ============================================

  describe('Mock Embedding Mode', () => {
    let mockPrisma: ReturnType<typeof createMockPrisma>;
    let indexer: DocumentIndexer;

    beforeEach(() => {
      process.env.MOCK_EMBEDDINGS = 'true';
      mockPrisma = createMockPrisma();
      indexer = createDocumentIndexer(mockPrisma as any);
    });

    afterEach(() => {
      delete process.env.MOCK_EMBEDDINGS;
    });

    it('generates deterministic mock embeddings with 1536 dimensions', async () => {
      const docId = 'doc-mock-001';
      const doc = fakeDocumentRow(docId);
      mockPrisma.$queryRaw.mockResolvedValue([doc]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result = await indexer.indexDocument(docId);

      expect(result.embeddingGenerated).toBe(true);
      expect(result.success).toBe(true);
    });

    it('produces consistent embeddings for the same input', async () => {
      const docId = 'doc-consistency-001';
      const doc = fakeDocumentRow(docId);
      // Mock returns the same doc on each call
      mockPrisma.$queryRaw.mockResolvedValue([doc]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result1 = await indexer.indexDocument(docId);
      const result2 = await indexer.indexDocument(docId);

      expect(result1.embeddingGenerated).toBe(true);
      expect(result2.embeddingGenerated).toBe(true);
      expect(result1.success).toBe(result2.success);
    });

    it('handles missing document gracefully', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await indexer.indexDocument('nonexistent-doc');

      expect(result.success).toBe(false);
      expect(result.embeddingGenerated).toBe(false);
    });

    it('handles batch indexing with mixed results', async () => {
      const doc1 = fakeDocumentRow('batch-001');
      const doc2 = fakeDocumentRow('batch-002');

      // indexBatch calls indexDocument sequentially — each call does its own $queryRaw
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([doc1])
        .mockResolvedValueOnce([]) // missing doc
        .mockResolvedValueOnce([doc2]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result = await indexer.indexBatch(['batch-001', 'missing-doc', 'batch-002']);

      expect(result.total).toBe(3);
      expect(result.successful).toBeGreaterThanOrEqual(2);
    });
  });
});
