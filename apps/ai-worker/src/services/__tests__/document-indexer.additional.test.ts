import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentIndexer, createDocumentIndexer } from '../document-indexer';

const mockPrisma = {
  caseDocument: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  contactNote: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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
  afterEach(() => {
    delete process.env.MOCK_EMBEDDINGS;
  });

  describe('indexNote error handling', () => {
    it('returns failure when note not found', async () => {
      mockPrisma.contactNote.findFirst.mockResolvedValue(null);
      const r = await indexer.indexNote('missing-id');
      expect(r.success).toBe(false);
      expect(r.error).toContain('not found');
    });

    it('returns failure on prisma error', async () => {
      mockPrisma.contactNote.findFirst.mockRejectedValue(new Error('db error'));
      const r = await indexer.indexNote('err-id');
      expect(r.success).toBe(false);
      expect(r.error).toContain('db error');
    });

    it('succeeds when note found', async () => {
      mockPrisma.contactNote.findFirst.mockResolvedValue({ id: 'n1', content: 'test content' });
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
      mockPrisma.contactNote.findFirst.mockImplementation(async (args: any) => ({
        id: args.where.id,
        content: 'text',
      }));
      mockPrisma.$executeRaw.mockResolvedValue(1);
      const progress: any[] = [];
      const r = await indexer.reindexAllNotes(undefined, (p) => progress.push({ ...p }));
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

  // IFC-156 (#245): a known id must not resolve cross-tenant when a tenantId is
  // supplied. The reindex worker carries the job's tenantId; verify it is
  // threaded into the read filters of both the note and document paths.
  describe('tenant-scoped reads (IFC-156)', () => {
    it('indexNote filters the note read by tenantId when supplied', async () => {
      mockPrisma.contactNote.findFirst.mockResolvedValue({ id: 'n1', content: 'c' });
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await indexer.indexNote('n1', 'tenant-a');

      expect(mockPrisma.contactNote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n1', tenantId: 'tenant-a' } })
      );
    });

    it('indexNote omits the tenant filter when no tenantId is supplied', async () => {
      mockPrisma.contactNote.findFirst.mockResolvedValue({ id: 'n1', content: 'c' });
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await indexer.indexNote('n1');

      expect(mockPrisma.contactNote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n1' } })
      );
    });

    it('does not resolve a foreign-tenant note (returns not found)', async () => {
      // Tenant-scoped read finds nothing for a note owned by another tenant.
      mockPrisma.contactNote.findFirst.mockResolvedValue(null);

      const r = await indexer.indexNote('foreign-note', 'tenant-a');

      expect(r.success).toBe(false);
      expect(r.error).toContain('not found');
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('indexNotesBatch threads tenantId to each note read', async () => {
      mockPrisma.contactNote.findFirst.mockResolvedValue({ id: 'n', content: 'c' });
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await indexer.indexNotesBatch(['n1', 'n2'], 'tenant-b');

      expect(mockPrisma.contactNote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n1', tenantId: 'tenant-b' } })
      );
      expect(mockPrisma.contactNote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n2', tenantId: 'tenant-b' } })
      );
    });

    it('indexDocument passes the tenantId as a bound parameter to the read', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'd1', title: 'T', description: null, extracted_text: 't', tags: [] },
      ]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await indexer.indexDocument('d1', 'tenant-c');

      // $queryRaw is a tagged template: [strings, ...values]. The tenant scope
      // value must be present among the bound parameters.
      const values = mockPrisma.$queryRaw.mock.calls[0].slice(1);
      expect(values).toContain('d1');
      expect(values).toContain('tenant-c');
    });

    it('indexBatch threads tenantId to the document read', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'd1', title: 'T', description: null, extracted_text: 't', tags: [] },
      ]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await indexer.indexBatch(['d1'], 'tenant-d');

      const values = mockPrisma.$queryRaw.mock.calls[0].slice(1);
      expect(values).toContain('tenant-d');
    });
  });
});
