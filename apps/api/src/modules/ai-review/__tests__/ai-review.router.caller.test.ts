/**
 * AI Review Router Caller Tests - IFC-180
 *
 * Supplementary tests that use createCaller to test router procedures
 * directly through the tRPC layer. Tests all 7 endpoints:
 * list, get, claim, approve, reject, escalate, stats.
 *
 * These tests supplement the existing ai-review.router.test.ts
 * which tests error mapping and mock object structures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock repository
const mockRepository = {
  save: vi.fn().mockResolvedValue(undefined),
  findById: vi.fn(),
  findByIdForUpdate: vi.fn(),
  saveWithOptimisticLock: vi.fn().mockResolvedValue(true),
  findPending: vi.fn().mockResolvedValue([]),
  countPending: vi.fn().mockResolvedValue(0),
  findWithExpiredLocks: vi.fn().mockResolvedValue([]),
};

// Mock adapters with proper function constructor
vi.mock('@intelliflow/adapters', () => {
  function MockPrismaAIOutputReviewRepository() {
    return mockRepository;
  }
  return {
    PrismaAIOutputReviewRepository: MockPrismaAIOutputReviewRepository,
  };
});

// Mock use case results
const mockClaimResult = {
  isFailure: false,
  value: {
    success: true,
    lockToken: 'mock-lock-token-value',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  },
};

const mockSuccessResult = {
  isFailure: false,
  value: { success: true },
};

const mockEscalateResult = {
  isFailure: false,
  value: { success: true, escalationDepth: 1 },
};

// Mock use case instances
const mockClaimUseCase = { execute: vi.fn().mockResolvedValue(mockClaimResult) };
const mockApproveUseCase = { execute: vi.fn().mockResolvedValue(mockSuccessResult) };
const mockRejectUseCase = { execute: vi.fn().mockResolvedValue(mockSuccessResult) };
const mockEscalateUseCase = { execute: vi.fn().mockResolvedValue(mockEscalateResult) };

// Mock application module with use case constructors
vi.mock('@intelliflow/application', () => ({
  ClaimReviewUseCase: function ClaimReviewUseCase() { return mockClaimUseCase; },
  ApproveReviewUseCase: function ApproveReviewUseCase() { return mockApproveUseCase; },
  RejectReviewUseCase: function RejectReviewUseCase() { return mockRejectUseCase; },
  EscalateReviewUseCase: function EscalateReviewUseCase() { return mockEscalateUseCase; },
  // Error classes needed by mapDomainErrorToTRPCError
  ReviewNotFoundError: class extends Error {
    code = 'REVIEW_NOT_FOUND';
    constructor() { super('Review not found'); }
  },
  ReviewAlreadyClaimedError: class extends Error {
    code = 'REVIEW_ALREADY_CLAIMED';
    constructor() { super('Review already claimed'); }
  },
  InvalidReviewStateError: class extends Error {
    code = 'INVALID_REVIEW_STATE';
    constructor(state: string) { super(`Invalid review state: ${state}`); }
  },
  ConcurrentModificationError: class extends Error {
    code = 'CONCURRENT_MODIFICATION';
    constructor() { super('Concurrent modification'); }
  },
  InvalidLockTokenError: class extends Error {
    code = 'INVALID_LOCK_TOKEN';
    constructor() { super('Invalid lock token'); }
  },
  LockExpiredError: class extends Error {
    code = 'LOCK_EXPIRED';
    constructor() { super('Lock expired'); }
  },
  NotLockHolderError: class extends Error {
    code = 'NOT_LOCK_HOLDER';
    constructor() { super('Not lock holder'); }
  },
  MaxEscalationReachedError: class extends Error {
    code = 'MAX_ESCALATION_REACHED';
    constructor(max: number) { super(`Max escalation depth reached: ${max}`); }
  },
  Result: {
    ok: (value: any) => ({ isFailure: false, value }),
    fail: (error: any) => ({ isFailure: true, error }),
  },
  // Error classes required by shared/error-mapper.ts instanceof checks
  ExternalServiceError: class extends Error { constructor(msg?: string) { super(msg); } },
  AuthorizationError: class extends Error { constructor(msg?: string) { super(msg); } },
  NotificationDeliveryError: class extends Error { constructor(msg?: string) { super(msg); } },
  NotificationSchedulingError: class extends Error { constructor(msg?: string) { super(msg); } },
  DuplicateWebhookError: class extends Error { constructor(msg?: string) { super(msg); } },
}));

import { aiReviewRouter } from '../ai-review.router';

const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const TEST_USER_ID = '00000000-0000-4000-8000-000000000103';
const TEST_REVIEW_ID = '00000000-0000-4000-8000-000000000401';

// Mock Prisma client for list and stats procedures (which use ctx.prisma directly)
const mockPrisma = {
  aIOutputReview: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
  },
} as any;

function createCallerContext() {
  return {
    prisma: mockPrisma,
    user: {
      userId: TEST_USER_ID,
      email: 'test@example.com',
      role: 'SALES_REP',
      tenantId: TEST_TENANT_ID,
    },
    tenant: {
      tenantId: TEST_TENANT_ID,
      tenantType: 'user' as const,
      userId: TEST_USER_ID,
      role: 'SALES_REP',
      canAccessAllTenantData: false,
    },
    prismaWithTenant: mockPrisma,
  } as any;
}

// Helper to create a mock review domain object (returned by repository.findById)
function createMockReview(overrides: Record<string, any> = {}) {
  return {
    id: { toString: () => TEST_REVIEW_ID, value: TEST_REVIEW_ID },
    tenantId: TEST_TENANT_ID,
    outputType: 'LEAD_SCORING',
    outputPayload: { score: 85, factors: ['engagement'] },
    confidence: 0.85,
    status: 'PENDING',
    slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    escalationDepth: 0,
    lockedBy: undefined,
    lockedAt: undefined,
    lockExpiresAt: undefined,
    reviewerId: undefined,
    reviewDecision: undefined,
    reviewNotes: undefined,
    createdAt: new Date('2026-02-05T10:00:00Z'),
    updatedAt: new Date('2026-02-05T10:00:00Z'),
    getDomainEvents: vi.fn().mockReturnValue([]),
    clearDomainEvents: vi.fn(),
    ...overrides,
  };
}

describe('aiReviewRouter (caller tests)', () => {
  let caller: ReturnType<typeof aiReviewRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    caller = aiReviewRouter.createCaller(createCallerContext());

    // Reset repository defaults
    mockRepository.findById.mockResolvedValue(null);
    mockRepository.findByIdForUpdate.mockResolvedValue(null);
    mockRepository.saveWithOptimisticLock.mockResolvedValue(true);
    mockRepository.save.mockResolvedValue(undefined);

    // Reset Prisma mock defaults
    mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
    mockPrisma.aIOutputReview.count.mockResolvedValue(0);
    mockPrisma.aIOutputReview.groupBy.mockResolvedValue([]);

    // Reset use case defaults
    mockClaimUseCase.execute.mockResolvedValue(mockClaimResult);
    mockApproveUseCase.execute.mockResolvedValue(mockSuccessResult);
    mockRejectUseCase.execute.mockResolvedValue(mockSuccessResult);
    mockEscalateUseCase.execute.mockResolvedValue(mockEscalateResult);
  });

  describe('list', () => {
    it('should return paginated reviews with defaults', async () => {
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      const result = await caller.list({});

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(false);
    });

    it('should return reviews mapped to response DTO', async () => {
      const mockRow = {
        id: TEST_REVIEW_ID,
        tenantId: TEST_TENANT_ID,
        outputType: 'LEAD_SCORING',
        outputPayload: { score: 85 },
        confidence: 0.85,
        status: 'PENDING',
        slaDeadline: new Date(),
        escalationDepth: 0,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        reviewerId: null,
        reviewDecision: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([mockRow]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(1);

      const result = await caller.list({});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(TEST_REVIEW_ID);
      expect(result.data[0].outputType).toBe('LEAD_SCORING');
      expect(result.data[0].confidence).toBe(0.85);
      expect(result.data[0].status).toBe('PENDING');
      expect(result.total).toBe(1);
    });

    it('should apply status filter to Prisma query', async () => {
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      await caller.list({
        status: ['PENDING', 'ESCALATED'],
      });

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            status: { in: ['PENDING', 'ESCALATED'] },
          }),
        })
      );
    });

    it('should apply output type filter', async () => {
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      await caller.list({
        outputType: ['LEAD_SCORING'],
      });

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            outputType: { in: ['LEAD_SCORING'] },
          }),
        })
      );
    });

    it('should support custom pagination', async () => {
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(50);

      const result = await caller.list({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        })
      );
    });

    it('should calculate hasMore correctly', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        id: `review-${i}`,
        tenantId: TEST_TENANT_ID,
        outputType: 'LEAD_SCORING',
        outputPayload: {},
        confidence: 0.85,
        status: 'PENDING',
        slaDeadline: new Date(),
        escalationDepth: 0,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        reviewerId: null,
        reviewDecision: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      mockPrisma.aIOutputReview.findMany.mockResolvedValue(rows);
      mockPrisma.aIOutputReview.count.mockResolvedValue(25);

      const result = await caller.list({ page: 1, limit: 10 });

      expect(result.hasMore).toBe(true);
    });

    it('should apply confidence range filter', async () => {
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      await caller.list({
        minConfidence: 0.5,
        maxConfidence: 0.9,
      });

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            confidence: { gte: 0.5, lte: 0.9 },
          }),
        })
      );
    });

    it('should apply sorting options', async () => {
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      await caller.list({
        sortBy: 'confidence',
        sortOrder: 'asc',
      });

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { confidence: 'asc' },
        })
      );
    });

    it('should enforce tenant isolation in where clause', async () => {
      mockPrisma.aIOutputReview.findMany.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      await caller.list({});

      expect(mockPrisma.aIOutputReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
          }),
        })
      );
      expect(mockPrisma.aIOutputReview.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
          }),
        })
      );
    });
  });

  describe('get', () => {
    it('should return a review when found', async () => {
      const mockReview = createMockReview();
      mockRepository.findById.mockResolvedValue(mockReview);

      const result = await caller.get({ reviewId: TEST_REVIEW_ID });

      expect(result.id).toBe(TEST_REVIEW_ID);
      expect(result.outputType).toBe('LEAD_SCORING');
      expect(result.confidence).toBe(0.85);
      expect(result.status).toBe('PENDING');
      expect(result.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should throw NOT_FOUND when review does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.get({ reviewId: TEST_REVIEW_ID })
      ).rejects.toThrow(TRPCError);

      try {
        await caller.get({ reviewId: TEST_REVIEW_ID });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
      }
    });

    it('should pass tenantId to repository for isolation', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      await caller.get({ reviewId: TEST_REVIEW_ID });

      expect(mockRepository.findById).toHaveBeenCalledWith(
        TEST_REVIEW_ID,
        TEST_TENANT_ID
      );
    });

    it('should return null for lock fields on unclaimed review', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      const result = await caller.get({ reviewId: TEST_REVIEW_ID });

      expect(result.lockedBy).toBeNull();
      expect(result.lockedAt).toBeNull();
      expect(result.lockExpiresAt).toBeNull();
    });

    it('should return populated lock fields for claimed review', async () => {
      const now = new Date();
      const claimedReview = createMockReview({
        status: 'IN_REVIEW',
        lockedBy: TEST_USER_ID,
        lockedAt: now,
        lockExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });
      mockRepository.findById.mockResolvedValue(claimedReview);

      const result = await caller.get({ reviewId: TEST_REVIEW_ID });

      expect(result.lockedBy).toBe(TEST_USER_ID);
      expect(result.lockedAt).toEqual(now);
      expect(result.lockExpiresAt).toBeDefined();
      expect(result.status).toBe('IN_REVIEW');
    });

    it('should map all 16 response fields', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      const result = await caller.get({ reviewId: TEST_REVIEW_ID });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('tenantId');
      expect(result).toHaveProperty('outputType');
      expect(result).toHaveProperty('outputPayload');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('slaDeadline');
      expect(result).toHaveProperty('escalationDepth');
      expect(result).toHaveProperty('lockedBy');
      expect(result).toHaveProperty('lockedAt');
      expect(result).toHaveProperty('lockExpiresAt');
      expect(result).toHaveProperty('reviewerId');
      expect(result).toHaveProperty('reviewDecision');
      expect(result).toHaveProperty('reviewNotes');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });
  });

  describe('claim', () => {
    it('should claim a review and return lock token', async () => {
      const review = createMockReview({ status: 'IN_REVIEW', lockedBy: TEST_USER_ID });
      mockRepository.findById.mockResolvedValue(review);

      const result = await caller.claim({ reviewId: TEST_REVIEW_ID });

      expect(result.success).toBe(true);
      expect(result.lockToken).toBe('mock-lock-token-value');
      expect(result.expiresAt).toBeDefined();
      expect(result.review).toBeDefined();
    });

    it('should call ClaimReviewUseCase with correct params', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      await caller.claim({
        reviewId: TEST_REVIEW_ID,
        lockDurationMinutes: 15,
      });

      expect(mockClaimUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewId: TEST_REVIEW_ID,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          lockDurationMinutes: 15,
        })
      );
    });

    it('should use default lock duration of 5 minutes', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      await caller.claim({ reviewId: TEST_REVIEW_ID });

      expect(mockClaimUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          lockDurationMinutes: 5,
        })
      );
    });

    it('should throw mapped error when use case fails', async () => {
      mockClaimUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'REVIEW_NOT_FOUND', message: 'Review not found' },
      });

      await expect(
        caller.claim({ reviewId: TEST_REVIEW_ID })
      ).rejects.toThrow(TRPCError);
    });

    it('should return updated review after claim', async () => {
      const updatedReview = createMockReview({
        status: 'IN_REVIEW',
        lockedBy: TEST_USER_ID,
      });
      mockRepository.findById.mockResolvedValue(updatedReview);

      const result = await caller.claim({ reviewId: TEST_REVIEW_ID });

      expect(result.review).toBeDefined();
      expect(result.review!.status).toBe('IN_REVIEW');
      expect(result.review!.lockedBy).toBe(TEST_USER_ID);
    });
  });

  describe('approve', () => {
    it('should approve a review with lock token', async () => {
      const updatedReview = createMockReview({
        status: 'APPROVED',
        reviewerId: TEST_USER_ID,
        reviewDecision: 'APPROVED',
      });
      mockRepository.findById.mockResolvedValue(updatedReview);

      const result = await caller.approve({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
      });

      expect(result.success).toBe(true);
      expect(result.review).toBeDefined();
      expect(result.review!.status).toBe('APPROVED');
    });

    it('should call ApproveReviewUseCase with correct params', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      await caller.approve({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
        feedback: 'Looks good',
      });

      expect(mockApproveUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewId: TEST_REVIEW_ID,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          lockToken: 'valid-lock-token',
          feedback: 'Looks good',
        })
      );
    });

    it('should allow approve without feedback', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      const result = await caller.approve({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
      });

      expect(result.success).toBe(true);
    });

    it('should throw mapped error when use case returns failure', async () => {
      mockApproveUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'INVALID_LOCK_TOKEN', message: 'Invalid lock token' },
      });

      await expect(
        caller.approve({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'bad-token',
        })
      ).rejects.toThrow(TRPCError);

      try {
        mockApproveUseCase.execute.mockResolvedValue({
          isFailure: true,
          error: { code: 'INVALID_LOCK_TOKEN', message: 'Invalid lock token' },
        });
        await caller.approve({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'bad-token',
        });
      } catch (err) {
        expect((err as TRPCError).code).toBe('UNAUTHORIZED');
      }
    });

    it('should reject empty lock token via Zod validation', async () => {
      await expect(
        caller.approve({
          reviewId: TEST_REVIEW_ID,
          lockToken: '',
        })
      ).rejects.toThrow();
    });
  });

  describe('reject', () => {
    it('should reject a review with notes', async () => {
      const updatedReview = createMockReview({
        status: 'REJECTED',
        reviewerId: TEST_USER_ID,
        reviewDecision: 'REJECTED',
        reviewNotes: 'Quality issues found',
      });
      mockRepository.findById.mockResolvedValue(updatedReview);

      const result = await caller.reject({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
        notes: 'Quality issues found',
      });

      expect(result.success).toBe(true);
      expect(result.review).toBeDefined();
      expect(result.review!.status).toBe('REJECTED');
    });

    it('should call RejectReviewUseCase with correct params', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      await caller.reject({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
        notes: 'Analysis lacks supporting data',
      });

      expect(mockRejectUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewId: TEST_REVIEW_ID,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          lockToken: 'valid-lock-token',
          notes: 'Analysis lacks supporting data',
        })
      );
    });

    it('should require non-empty notes via Zod validation', async () => {
      await expect(
        caller.reject({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'valid-lock-token',
          notes: '',
        })
      ).rejects.toThrow();
    });

    it('should throw mapped error on use case failure', async () => {
      mockRejectUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'NOT_LOCK_HOLDER', message: 'Not lock holder' },
      });

      try {
        await caller.reject({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'valid-lock-token',
          notes: 'Rejecting for quality',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('FORBIDDEN');
      }
    });
  });

  describe('escalate', () => {
    it('should escalate a review with reason', async () => {
      const updatedReview = createMockReview({
        status: 'ESCALATED',
        escalationDepth: 1,
      });
      mockRepository.findById.mockResolvedValue(updatedReview);

      const result = await caller.escalate({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
        reason: 'Need specialist review',
      });

      expect(result.success).toBe(true);
      expect(result.escalationDepth).toBe(1);
      expect(result.review).toBeDefined();
    });

    it('should call EscalateReviewUseCase with correct params', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      await caller.escalate({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
        reason: 'Edge case detected',
        targetUserId: '00000000-0000-4000-8000-000000000999',
      });

      expect(mockEscalateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewId: TEST_REVIEW_ID,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          lockToken: 'valid-lock-token',
          reason: 'Edge case detected',
          targetUserId: '00000000-0000-4000-8000-000000000999',
        })
      );
    });

    it('should require non-empty reason via Zod validation', async () => {
      await expect(
        caller.escalate({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'valid-lock-token',
          reason: '',
        })
      ).rejects.toThrow();
    });

    it('should throw mapped error when max escalation reached', async () => {
      mockEscalateUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'MAX_ESCALATION_REACHED', message: 'Max escalation depth reached: 3' },
      });

      try {
        await caller.escalate({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'valid-lock-token',
          reason: 'Need escalation',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('CONFLICT');
      }
    });

    it('should allow escalation without targetUserId', async () => {
      mockRepository.findById.mockResolvedValue(createMockReview());

      const result = await caller.escalate({
        reviewId: TEST_REVIEW_ID,
        lockToken: 'valid-lock-token',
        reason: 'General escalation',
      });

      expect(result.success).toBe(true);
      expect(mockEscalateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: undefined,
        })
      );
    });
  });

  describe('stats', () => {
    it('should return status counts and totals', async () => {
      mockPrisma.aIOutputReview.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { status: 5 } },
        { status: 'IN_REVIEW', _count: { status: 3 } },
        { status: 'APPROVED', _count: { status: 10 } },
        { status: 'REJECTED', _count: { status: 2 } },
        { status: 'ESCALATED', _count: { status: 1 } },
      ]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(2);

      const result = await caller.stats({});

      expect(result.pending).toBe(5);
      expect(result.inReview).toBe(3);
      expect(result.approved).toBe(10);
      expect(result.rejected).toBe(2);
      expect(result.escalated).toBe(1);
      expect(result.expired).toBe(0);
      expect(result.slaBreachedCount).toBe(2);
      expect(result.totalReviews).toBe(21);
    });

    it('should return all zeros when no reviews exist', async () => {
      mockPrisma.aIOutputReview.groupBy.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      const result = await caller.stats({});

      expect(result.pending).toBe(0);
      expect(result.inReview).toBe(0);
      expect(result.approved).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.escalated).toBe(0);
      expect(result.expired).toBe(0);
      expect(result.slaBreachedCount).toBe(0);
      expect(result.totalReviews).toBe(0);
    });

    it('should filter by output type when provided', async () => {
      mockPrisma.aIOutputReview.groupBy.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      await caller.stats({ outputType: 'LEAD_SCORING' });

      expect(mockPrisma.aIOutputReview.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            outputType: 'LEAD_SCORING',
          }),
        })
      );
    });

    it('should enforce tenant isolation on stats', async () => {
      mockPrisma.aIOutputReview.groupBy.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(0);

      await caller.stats({});

      expect(mockPrisma.aIOutputReview.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
          }),
        })
      );
    });

    it('should query SLA breached count separately', async () => {
      mockPrisma.aIOutputReview.groupBy.mockResolvedValue([]);
      mockPrisma.aIOutputReview.count.mockResolvedValue(5);

      const result = await caller.stats({});

      expect(result.slaBreachedCount).toBe(5);
      expect(mockPrisma.aIOutputReview.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            slaDeadline: { lt: expect.any(Date) },
            status: { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] },
          }),
        })
      );
    });
  });

  describe('error mapping through caller', () => {
    it('should map REVIEW_ALREADY_CLAIMED to CONFLICT', async () => {
      mockClaimUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'REVIEW_ALREADY_CLAIMED', message: 'Already claimed' },
      });

      try {
        await caller.claim({ reviewId: TEST_REVIEW_ID });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('CONFLICT');
      }
    });

    it('should map LOCK_EXPIRED to UNAUTHORIZED', async () => {
      mockApproveUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'LOCK_EXPIRED', message: 'Lock expired' },
      });

      try {
        await caller.approve({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'expired-token',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('UNAUTHORIZED');
      }
    });

    it('should map CONCURRENT_MODIFICATION to CONFLICT', async () => {
      mockRejectUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'CONCURRENT_MODIFICATION', message: 'Concurrent modification' },
      });

      try {
        await caller.reject({
          reviewId: TEST_REVIEW_ID,
          lockToken: 'valid-token',
          notes: 'Rejecting',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('CONFLICT');
      }
    });

    it('should map unknown errors to INTERNAL_SERVER_ERROR', async () => {
      mockClaimUseCase.execute.mockResolvedValue({
        isFailure: true,
        error: { code: 'UNKNOWN_ERROR', message: 'Something weird happened' },
      });

      try {
        await caller.claim({ reviewId: TEST_REVIEW_ID });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      }
    });
  });
});
