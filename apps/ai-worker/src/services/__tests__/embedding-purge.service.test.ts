/**
 * EmbeddingPurgeService Tests (IFC-155)
 *
 * Tests for GDPR-compliant purge of search indexes.
 * Covers:
 * - Atomic purge of document and note embeddings
 * - Legal hold enforcement
 * - Audit logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingPurgeService, LegalHoldError } from '../embedding-purge.service';

// Mock PrismaClient
const createMockPrisma = () => ({
  // IFC-155: Using $queryRaw for legal hold check since model may not exist
  $queryRaw: vi.fn().mockResolvedValue([]),
  auditLogEntry: {
    create: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
});

describe('EmbeddingPurgeService (IFC-155)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: EmbeddingPurgeService;

  const testTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const testSubjectId = 'user-123';

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmbeddingPurgeService(prisma as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('purgeForSubject', () => {
    it('should purge document embeddings for subject', async () => {
      // Arrange - no legal holds
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          $executeRaw: vi.fn()
            .mockResolvedValueOnce(5) // documents purged
            .mockResolvedValueOnce(3), // notes purged
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({ id: 'audit-123' }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.purgeForSubject(testSubjectId, testTenantId);

      // Assert
      expect(result.documentsPurged).toBe(5);
      expect(result.notesPurged).toBe(3);
      expect(result.purgedFields).toContain('embedding');
      expect(result.purgedFields).toContain('search_vector');
    });

    it('should purge note embeddings and redact content', async () => {
      // Arrange - no legal holds
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          $executeRaw: vi.fn()
            .mockResolvedValueOnce(0) // no documents
            .mockResolvedValueOnce(10), // notes purged
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({ id: 'audit-456' }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.purgeForSubject(testSubjectId, testTenantId);

      // Assert
      expect(result.notesPurged).toBe(10);
      expect(result.purgedFields).toContain('content');
    });

    it('should execute atomically (all or nothing)', async () => {
      // Arrange - no legal holds but transaction fails
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      // Act & Assert
      await expect(service.purgeForSubject(testSubjectId, testTenantId))
        .rejects.toThrow('Transaction failed');
    });

    it('should respect legal hold', async () => {
      // Arrange - legal hold exists
      prisma.$queryRaw.mockResolvedValue([{
        id: 'hold-123',
        retention_until: new Date('2027-01-01'),
      }]);

      // Act & Assert
      await expect(service.purgeForSubject(testSubjectId, testTenantId))
        .rejects.toThrow(LegalHoldError);
    });

    it('should create audit log entry', async () => {
      // Arrange - no legal holds
      prisma.$queryRaw.mockResolvedValue([]);
      let auditCreateCalled = false;
      prisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          $executeRaw: vi.fn()
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1),
          auditLogEntry: {
            create: vi.fn().mockImplementation(() => {
              auditCreateCalled = true;
              return Promise.resolve({ id: 'audit-789' });
            }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.purgeForSubject(testSubjectId, testTenantId, 'Test DSAR Request');

      // Assert
      expect(auditCreateCalled).toBe(true);
      expect(result.auditLogId).toBe('audit-789');
    });

    it('should handle empty results gracefully', async () => {
      // Arrange - no legal holds
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          $executeRaw: vi.fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0),
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({ id: 'audit-empty' }),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.purgeForSubject(testSubjectId, testTenantId);

      // Assert
      expect(result.documentsPurged).toBe(0);
      expect(result.notesPurged).toBe(0);
      expect(result.auditLogId).toBe('audit-empty');
    });

    it('should handle legal hold query failure gracefully', async () => {
      // Arrange - legal hold query throws (table doesn't exist yet)
      prisma.$queryRaw.mockRejectedValue(new Error('relation "legal_holds" does not exist'));
      prisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          $executeRaw: vi.fn()
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1),
          auditLogEntry: {
            create: vi.fn().mockResolvedValue({ id: 'audit-fallback' }),
          },
        };
        return fn(tx);
      });

      // Act - should proceed with purge (legal hold table may not exist)
      const result = await service.purgeForSubject(testSubjectId, testTenantId);

      // Assert
      expect(result.documentsPurged).toBe(1);
      expect(result.notesPurged).toBe(1);
      expect(result.auditLogId).toBe('audit-fallback');
    });

    it('should handle legal hold with null retention_until', async () => {
      // Arrange - legal hold exists with no expiry
      prisma.$queryRaw.mockResolvedValue([{
        id: 'hold-indefinite',
        retention_until: null,
      }]);

      // Act & Assert
      await expect(service.purgeForSubject(testSubjectId, testTenantId))
        .rejects.toThrow('indefinite');
    });
  });

  describe('verifyPurge', () => {
    it('should return isPurged true when no searchable data remains', async () => {
      // Arrange - no remaining documents or notes
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(0) }]) // documents
        .mockResolvedValueOnce([{ count: BigInt(0) }]); // notes

      // Act
      const result = await service.verifyPurge(testSubjectId, testTenantId);

      // Assert
      expect(result.isPurged).toBe(true);
      expect(result.documentsRemaining).toBe(0);
      expect(result.notesRemaining).toBe(0);
    });

    it('should return isPurged false when documents still have embeddings', async () => {
      // Arrange - documents remain with embeddings
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(3) }]) // 3 documents still have embeddings
        .mockResolvedValueOnce([{ count: BigInt(0) }]); // notes are purged

      // Act
      const result = await service.verifyPurge(testSubjectId, testTenantId);

      // Assert
      expect(result.isPurged).toBe(false);
      expect(result.documentsRemaining).toBe(3);
      expect(result.notesRemaining).toBe(0);
    });

    it('should return isPurged false when notes still have content', async () => {
      // Arrange - notes remain with content
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(0) }]) // documents are purged
        .mockResolvedValueOnce([{ count: BigInt(2) }]); // 2 notes still have content

      // Act
      const result = await service.verifyPurge(testSubjectId, testTenantId);

      // Assert
      expect(result.isPurged).toBe(false);
      expect(result.documentsRemaining).toBe(0);
      expect(result.notesRemaining).toBe(2);
    });

    it('should handle empty query results', async () => {
      // Arrange - empty result from query (edge case)
      prisma.$queryRaw
        .mockResolvedValueOnce([{}]) // missing count field
        .mockResolvedValueOnce([{}]);

      // Act
      const result = await service.verifyPurge(testSubjectId, testTenantId);

      // Assert
      expect(result.isPurged).toBe(true);
      expect(result.documentsRemaining).toBe(0);
      expect(result.notesRemaining).toBe(0);
    });
  });
});
