import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentIndexer, createDocumentIndexer } from '../document-indexer';

const mockPrisma = {
  caseDocument: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  contactNote: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
};

describe('DocumentIndexer additional', () => {
  let indexer: DocumentIndexer;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MOCK_EMBEDDINGS = 'true';
    indexer = createDocumentIndexer(mockPrisma as any);
  });
  afterEach(() => { delete process.env.MOCK_EMBEDDINGS; });

  describe('indexNote error handling', () => {
    it('returns failure when note not found', async () => {
      mockPrisma.contactNote.findUnique.mockResolvedValue(null);
      const r = await indexer.indexNote('missing-id');
      expect(r.success).toBe(false);
      expect(r.error).toContain('not found');
    });

    it('returns failure on prisma error', async () => {
      mockPrisma.contactNote.findUnique.mockRejectedValue(new Error('db error'));
      const r = await indexer.indexNote('err-id');
      expect(r.success).toBe(false);
      expect(r.error).toContain('db error');
    });

    it('succeeds when note found', async () => {
      mockPrisma.contactNote.findUnique.mockResolvedValue({ id: 'n1', content: 'test content' });
      mockPrisma.$executeRaw.mockResolvedValue(1);
      const r = await indexer.indexNote('n1');
      expect(r.success).toBe(true);
      expect(r.embeddingGenerated).toBe(true);
    });
  });

  describe('getUnindexedDocuments', () => {
    it('without tenant uses global query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
      const r = await indexer.getUnindexedDocuments();
      expect(r).toEqual(['d1', 'd2']);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
    it('with tenant uses tenant query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'd3' }]);
      const r = await indexer.getUnindexedDocuments('t1');
      expect(r).toEqual(['d3']);
    });
  });

  describe('getUnindexedNotes', () => {
    it('without tenant', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'n1' }]);
      const r = await indexer.getUnindexedNotes();
      expect(r).toEqual(['n1']);
    });
    it('with tenant', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'n2' }]);
      const r = await indexer.getUnindexedNotes('t1');
      expect(r).toEqual(['n2']);
    });
  });

  describe('getIndexStats', () => {
    it('without tenant', async () => {
      mockPrisma.caseDocument.count.mockResolvedValue(10);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(7) }]);
      mockPrisma.contactNote.count.mockResolvedValue(5);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(3) }]);
      const s = await indexer.getIndexStats();
      expect(s.documents.total).toBe(10);
      expect(s.documents.indexed).toBe(7);
      expect(s.documents.unindexed).toBe(3);
      expect(s.notes.total).toBe(5);
      expect(s.notes.indexed).toBe(3);
      expect(s.notes.unindexed).toBe(2);
    });
    it('with tenant', async () => {
      mockPrisma.caseDocument.count.mockResolvedValue(4);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]);
      mockPrisma.contactNote.count.mockResolvedValue(3);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(1) }]);
      const s = await indexer.getIndexStats('t1');
      expect(s.documents.total).toBe(4);
      expect(s.notes.indexed).toBe(1);
    });
  });

  describe('reindexAllNotes', () => {
    it('with progress callback', async () => {
      mockPrisma.contactNote.count.mockResolvedValue(2);
      mockPrisma.contactNote.findMany.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);
      mockPrisma.contactNote.findUnique.mockImplementation(async (args: any) => ({ id: args.where.id, content: 'text' }));
      mockPrisma.$executeRaw.mockResolvedValue(1);
      const progress: any[] = [];
      const r = await indexer.reindexAllNotes(undefined, (p) => progress.push({...p}));
      expect(r.total).toBe(2);
      expect(r.successful).toBe(2);
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[0].totalBatches).toBeGreaterThanOrEqual(1);
    });
    it('without tenant', async () => {
      mockPrisma.contactNote.count.mockResolvedValue(0);
      const r = await indexer.reindexAllNotes();
      expect(r.total).toBe(0);
      expect(r.successful).toBe(0);
    });
  });

  describe('reindexAll', () => {
    it('without tenant', async () => {
      mockPrisma.caseDocument.count.mockResolvedValue(0);
      const r = await indexer.reindexAll();
      expect(r.total).toBe(0);
    });
  });
});
