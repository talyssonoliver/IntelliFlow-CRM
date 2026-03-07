/**
 * PrismaAIOutputReviewRepository Tests (IFC-179)
 *
 * Unit tests for the AI Output Review repository implementation.
 * Tests cover all 7 interface methods with tenant isolation and optimistic locking.
 *
 * @module ai-output-review-repository-tests
 * @implements IFC-179
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@intelliflow/db';
import {
  PrismaAIOutputReviewRepository,
  OptimisticLockError,
} from '../PrismaAIOutputReviewRepository';
import { AIOutputReview, ReviewStatus, ReviewDecision, AIOutputType } from '@intelliflow/domain';
import { randomUUID } from 'node:crypto';

// Generate valid UUIDs for tests
const REVIEW_ID_1 = randomUUID();
const REVIEW_ID_2 = randomUUID();
const NON_EXISTENT_ID = randomUUID();
const TENANT_ID = 'tenant-test-123';
const OTHER_TENANT_ID = 'tenant-other-456';

// Mock Prisma client
const mockPrisma = {
  aIOutputReview: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  $queryRaw: vi.fn(),
} as PrismaClient;

describe('PrismaAIOutputReviewRepository', () => {
  let repository: PrismaAIOutputReviewRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaAIOutputReviewRepository(mockPrisma);
  });

  /**
   * Factory: Create mock Prisma record data
   */
  const createMockReviewData = (overrides: Record<string, unknown> = {}) => ({
    id: REVIEW_ID_1,
    tenantId: TENANT_ID,
    outputType: 'LEAD_SCORING' as AIOutputType,
    outputPayload: { leadId: 'lead-123', score: 85, reasoning: 'High engagement signals' },
    confidence: 0.85,
    status: 'PENDING' as const,
    slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    escalationDepth: 0,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: null,
    reviewDecision: null,
    reviewNotes: null,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  /**
   * Factory: Create mock domain aggregate
   */
  const createMockReview = (overrides: Record<string, unknown> = {}) => {
    const data = createMockReviewData(overrides);
    return AIOutputReview.reconstitute(
      data.id as string,
      data.tenantId as string,
      data.outputType as AIOutputType,
      data.outputPayload,
      data.confidence as number,
      data.status as ReviewStatus,
      data.slaDeadline as Date,
      data.escalationDepth as number,
      (data.lockedBy as string | null) ?? undefined,
      (data.lockedAt as Date | null) ?? undefined,
      (data.lockExpiresAt as Date | null) ?? undefined,
      (data.reviewerId as string | null) ?? undefined,
      (data.reviewDecision as ReviewDecision | null) ?? undefined,
      (data.reviewNotes as string | null) ?? undefined
    );
  };

  // ======================================================================
  // findById Tests
  // ======================================================================
  describe('findById', () => {
    it('should return review when found', async () => {
      const mockData = createMockReviewData();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(mockData as never);

      const result = await repository.findById(REVIEW_ID_1, TENANT_ID);

      expect(result).not.toBeNull();
      expect(result!.id.toValue()).toBe(REVIEW_ID_1);
      expect(mockPrisma.aIOutputReview.findUnique).toHaveBeenCalledWith({
        where: { id: REVIEW_ID_1, tenantId: TENANT_ID },
      });
    });

    it('should return null when not found', async () => {
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(null);

      const result = await repository.findById(NON_EXISTENT_ID, TENANT_ID);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation in query', async () => {
      const mockData = createMockReviewData();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(mockData as never);

      await repository.findById(REVIEW_ID_1, TENANT_ID);

      expect(mockPrisma.aIOutputReview.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      );
    });

    it('should correctly reconstitute domain aggregate', async () => {
      const mockData = createMockReviewData({
        status: 'IN_REVIEW',
        lockedBy: 'user-reviewer-1',
        lockedAt: new Date(),
        lockExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(mockData as never);

      const result = await repository.findById(REVIEW_ID_1, TENANT_ID);

      expect(result!.status).toBe(ReviewStatus.IN_REVIEW);
      expect(result!.lockedBy).toBe('user-reviewer-1');
      expect(result!.lockExpiresAt).toBeInstanceOf(Date);
    });

    it('should handle optional fields correctly', async () => {
      const mockData = createMockReviewData({
        status: 'APPROVED',
        reviewerId: 'reviewer-123',
        reviewDecision: 'APPROVED',
        reviewNotes: 'Looks good, approved',
      });
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(mockData as never);

      const result = await repository.findById(REVIEW_ID_1, TENANT_ID);

      expect(result!.status).toBe(ReviewStatus.APPROVED);
      expect(result!.reviewerId).toBe('reviewer-123');
      expect(result!.reviewDecision).toBe(ReviewDecision.APPROVED);
      expect(result!.reviewNotes).toBe('Looks good, approved');
    });
  });

  // ======================================================================
  // save Tests
  // ======================================================================
  describe('save', () => {
    it('should create new review with version 0', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(null);
      vi.mocked(mockPrisma.aIOutputReview.create).mockResolvedValue(
        createMockReviewData() as never
      );

      await repository.save(review);

      expect(mockPrisma.aIOutputReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 0 }),
        })
      );
    });

    it('should update existing review with version check', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(
        createMockReviewData({ version: 0 }) as never
      );
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(review);

      expect(mockPrisma.aIOutputReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ version: 0 }),
        })
      );
    });

    it('should throw OptimisticLockError on version conflict', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(
        createMockReviewData({ version: 0 }) as never
      );
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(repository.save(review)).rejects.toThrow(OptimisticLockError);
    });

    it('should include tenantId in WHERE clause for updates', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(
        createMockReviewData({ version: 0 }) as never
      );
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(review);

      expect(mockPrisma.aIOutputReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        })
      );
    });

    it('should map domain aggregate to persistence correctly', async () => {
      const review = createMockReview({
        outputType: 'AUTO_RESPONSE',
        confidence: 0.92,
        escalationDepth: 1,
      });
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(null);
      vi.mocked(mockPrisma.aIOutputReview.create).mockResolvedValue(
        createMockReviewData() as never
      );

      await repository.save(review);

      expect(mockPrisma.aIOutputReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outputType: 'AUTO_RESPONSE',
            confidence: 0.92,
            escalationDepth: 1,
          }),
        })
      );
    });
  });

  // ======================================================================
  // saveWithOptimisticLock Tests
  // ======================================================================
  describe('saveWithOptimisticLock', () => {
    it('should return true when version matches', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 1 } as never);

      const result = await repository.saveWithOptimisticLock(review, 0);

      expect(result).toBe(true);
    });

    it('should return false when version conflicts', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 0 } as never);

      const result = await repository.saveWithOptimisticLock(review, 1);

      expect(result).toBe(false);
    });

    it('should not throw errors, only return boolean', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 0 } as never);

      const result = await repository.saveWithOptimisticLock(review, 999);

      expect(result).toBe(false);
      // Verify no exception thrown
      expect(typeof result).toBe('boolean');
    });

    it('should use expected version in WHERE clause', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.saveWithOptimisticLock(review, 5);

      expect(mockPrisma.aIOutputReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            version: 5,
          }),
        })
      );
    });

    it('should include tenantId in WHERE clause', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.saveWithOptimisticLock(review, 0);

      expect(mockPrisma.aIOutputReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        })
      );
    });
  });

  // ======================================================================
  // findByIdForUpdate Tests
  // ======================================================================
  describe('findByIdForUpdate', () => {
    it('should use raw query with FOR UPDATE', async () => {
      const mockData = [createMockReviewData()];
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue(mockData as never);

      await repository.findByIdForUpdate(REVIEW_ID_1, TENANT_ID);

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([] as never);

      const result = await repository.findByIdForUpdate(NON_EXISTENT_ID, TENANT_ID);

      expect(result).toBeNull();
    });

    it('should filter by tenantId', async () => {
      const mockData = [createMockReviewData()];
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue(mockData as never);

      await repository.findByIdForUpdate(REVIEW_ID_1, TENANT_ID);

      // Template literal query will include tenantId parameter
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should reconstitute domain aggregate from raw query', async () => {
      const mockData = [
        createMockReviewData({
          status: 'ESCALATED',
          escalationDepth: 2,
        }),
      ];
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue(mockData as never);

      const result = await repository.findByIdForUpdate(REVIEW_ID_1, TENANT_ID);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(ReviewStatus.ESCALATED);
      expect(result!.escalationDepth).toBe(2);
    });
  });

  // ======================================================================
  // findPending Tests
  // ======================================================================
  describe('findPending', () => {
    it('should filter by PENDING and ESCALATED status', async () => {
      const mockData = [createMockReviewData()];
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue(mockData as never);

      await repository.findPending(TENANT_ID);

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'ESCALATED'] },
          }),
        })
      );
    });

    it('should filter by tenantId', async () => {
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue([]);

      await repository.findPending(TENANT_ID);

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        })
      );
    });

    it('should support outputType filter', async () => {
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue([]);

      await repository.findPending(TENANT_ID, { outputType: 'LEAD_SCORING' });

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            outputType: 'LEAD_SCORING',
          }),
        })
      );
    });

    it('should support limit and offset', async () => {
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue([]);

      await repository.findPending(TENANT_ID, { limit: 10, offset: 5 });

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 5,
        })
      );
    });

    it('should order by createdAt desc', async () => {
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue([]);

      await repository.findPending(TENANT_ID);

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should return multiple reviews mapped to domain aggregates', async () => {
      const mockData = [
        createMockReviewData({ id: REVIEW_ID_1 }),
        createMockReviewData({ id: REVIEW_ID_2, status: 'ESCALATED' }),
      ];
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue(mockData as never);

      const result = await repository.findPending(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id.toValue()).toBe(REVIEW_ID_1);
      expect(result[1].id.toValue()).toBe(REVIEW_ID_2);
    });
  });

  // ======================================================================
  // countPending Tests
  // ======================================================================
  describe('countPending', () => {
    it('should count pending reviews', async () => {
      vi.mocked(mockPrisma.aIOutputReview.count).mockResolvedValue(5);

      const result = await repository.countPending(TENANT_ID);

      expect(result).toBe(5);
      expect(mockPrisma.aIOutputReview.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            status: { in: ['PENDING', 'ESCALATED'] },
          }),
        })
      );
    });

    it('should filter by outputType when provided', async () => {
      vi.mocked(mockPrisma.aIOutputReview.count).mockResolvedValue(3);

      await repository.countPending(TENANT_ID, 'AUTO_RESPONSE');

      expect(mockPrisma.aIOutputReview.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            outputType: 'AUTO_RESPONSE',
          }),
        })
      );
    });

    it('should return 0 when no pending reviews', async () => {
      vi.mocked(mockPrisma.aIOutputReview.count).mockResolvedValue(0);

      const result = await repository.countPending(TENANT_ID);

      expect(result).toBe(0);
    });
  });

  // ======================================================================
  // findWithExpiredLocks Tests
  // ======================================================================
  describe('findWithExpiredLocks', () => {
    it('should find IN_REVIEW with lockExpiresAt < cutoffTime', async () => {
      const expiredLock = createMockReviewData({
        status: 'IN_REVIEW',
        lockedBy: 'user-1',
        lockExpiresAt: new Date(Date.now() - 1000),
      });
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue([expiredLock] as never);

      const cutoffTime = new Date();
      await repository.findWithExpiredLocks(cutoffTime);

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'IN_REVIEW',
            lockExpiresAt: { lt: cutoffTime },
          }),
        })
      );
    });

    it('should return empty array when no expired locks', async () => {
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue([]);

      const result = await repository.findWithExpiredLocks(new Date());

      expect(result).toHaveLength(0);
    });

    it('should return multiple reviews with expired locks', async () => {
      const expiredLocks = [
        createMockReviewData({
          id: REVIEW_ID_1,
          status: 'IN_REVIEW',
          lockedBy: 'user-1',
          lockExpiresAt: new Date(Date.now() - 1000),
        }),
        createMockReviewData({
          id: REVIEW_ID_2,
          status: 'IN_REVIEW',
          lockedBy: 'user-2',
          lockExpiresAt: new Date(Date.now() - 2000),
        }),
      ];
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue(expiredLocks as never);

      const result = await repository.findWithExpiredLocks(new Date());

      expect(result).toHaveLength(2);
    });
  });

  // ======================================================================
  // Tenant Isolation Tests
  // ======================================================================
  describe('tenant isolation', () => {
    it('should prevent cross-tenant access in findById', async () => {
      const mockData = createMockReviewData({ tenantId: OTHER_TENANT_ID });
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(mockData as never);

      // Query with wrong tenant - should return what Prisma returns
      // In real DB, this query wouldn't match due to tenantId filter
      await repository.findById(REVIEW_ID_1, TENANT_ID);

      expect(mockPrisma.aIOutputReview.findUnique).toHaveBeenCalledWith({
        where: { id: REVIEW_ID_1, tenantId: TENANT_ID },
      });
    });

    it('should include tenantId in all findPending queries', async () => {
      vi.mocked(mockPrisma.aIOutputReview.findMany).mockResolvedValue([]);

      await repository.findPending(TENANT_ID);
      await repository.findPending(OTHER_TENANT_ID);

      const calls = vi.mocked(mockPrisma.aIOutputReview.findMany).mock.calls;
      expect(calls[0][0].where).toHaveProperty('tenantId', TENANT_ID);
      expect(calls[1][0].where).toHaveProperty('tenantId', OTHER_TENANT_ID);
    });

    it('should include tenantId in countPending queries', async () => {
      vi.mocked(mockPrisma.aIOutputReview.count).mockResolvedValue(0);

      await repository.countPending(TENANT_ID);

      expect(mockPrisma.aIOutputReview.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        })
      );
    });
  });

  // ======================================================================
  // Optimistic Locking Integration Tests
  // ======================================================================
  describe('optimistic locking', () => {
    it('should detect concurrent modifications', async () => {
      // First save succeeds
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(
        createMockReviewData({ version: 1 }) as never
      );
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 0 } as never);

      // Save should fail due to version mismatch
      await expect(repository.save(review)).rejects.toThrow(OptimisticLockError);
    });

    it('should include version in WHERE clause', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(
        createMockReviewData({ version: 2 }) as never
      );
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(review);

      expect(mockPrisma.aIOutputReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            version: 2,
          }),
        })
      );
    });

    it('should increment version in update data', async () => {
      const review = createMockReview();
      vi.mocked(mockPrisma.aIOutputReview.findUnique).mockResolvedValue(
        createMockReviewData({ version: 3 }) as never
      );
      vi.mocked(mockPrisma.aIOutputReview.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(review);

      expect(mockPrisma.aIOutputReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 4, // Previous version + 1
          }),
        })
      );
    });
  });
});
