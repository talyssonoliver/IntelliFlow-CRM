/**
 * AI Output Review Router - IFC-180: AI Output Review tRPC Router
 *
 * Provides type-safe tRPC endpoints for human-in-the-loop review of AI outputs:
 * - list: Paginated, filtered review queue
 * - get: Single review details
 * - claim: Acquire exclusive lock for review
 * - approve: Approve with optional feedback
 * - reject: Reject with mandatory notes
 * - escalate: Escalate to higher authority
 * - stats: Review queue statistics
 *
 * All endpoints use tenantProcedure for multi-tenant isolation.
 * Follows lazy-loaded repository + use case instantiation pattern (autoresponse.router.ts).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { reviewListFilterSchema, aiOutputTypeSchema, idSchema } from '@intelliflow/validators';
import type {
  IAIOutputReviewRepository,
  AIOutputReview,
  DomainError,
  DomainEvent,
} from '@intelliflow/domain';
import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';
import { mapErrorToTRPCError as centralizedErrorMapper } from '../../shared/error-mapper';

// ============================================================
// Lazy-loaded repository (follows autoresponse.router.ts pattern)
// ============================================================

let _repositoryClass: (new (prisma: any) => IAIOutputReviewRepository) | null = null;

async function getRepositoryClass(): Promise<new (prisma: any) => IAIOutputReviewRepository> {
  if (!_repositoryClass) {
    const adapters = await import('@intelliflow/adapters');
    _repositoryClass = (adapters as any).PrismaAIOutputReviewRepository;
  }
  return _repositoryClass!;
}

async function getRepository(ctx: Context): Promise<IAIOutputReviewRepository> {
  const RepositoryClass = await getRepositoryClass();
  return new RepositoryClass(ctx.prisma);
}

// ============================================================
// Lazy-loaded use cases (dynamic import to work around tsup DTS resolution)
// ============================================================

let _applicationModule: any = null;

async function getApplicationModule(): Promise<any> {
  if (!_applicationModule) {
    _applicationModule = await import('@intelliflow/application');
  }
  return _applicationModule;
}

// ============================================================
// Lock token secret
// ============================================================

const LOCK_TOKEN_SECRET = process.env.REVIEW_LOCK_TOKEN_SECRET || 'dev-secret-change-in-production';

if (!process.env.REVIEW_LOCK_TOKEN_SECRET) {
  console.warn('[AIReview] WARNING: REVIEW_LOCK_TOKEN_SECRET not set, using dev fallback');
}

// ============================================================
// Event bus (fire-and-forget logging pattern)
// ============================================================

interface EventBusPort {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): Promise<void>;
}

const eventBus: EventBusPort = {
  publish: async (event: DomainEvent) => {
    console.log('[AIReview] Event:', event.constructor?.name || 'DomainEvent');
  },
  publishAll: async (events: DomainEvent[]) => {
    events.forEach((e: DomainEvent) =>
      console.log('[AIReview] Event:', e.constructor?.name || 'DomainEvent')
    );
  },
  subscribe: async () => {
    // No-op for fire-and-forget bus
  },
};

// ============================================================
// Error mapping: Domain Error → TRPCError
// ============================================================

/**
 * Maps domain error codes to tRPC error codes.
 * Exported for testing.
 *
 * Note: This function is deprecated in favor of the centralized error mapper.
 * It's kept for backward compatibility and tests.
 * New code should use mapErrorToTRPCError from '../../shared/error-mapper'
 */
export function mapDomainErrorToTRPCError(error: DomainError): TRPCError {
  // Delegate to centralized error mapper
  return centralizedErrorMapper(error);
}

// ============================================================
// Review-to-DTO mapper
// ============================================================

/**
 * Maps an AIOutputReview domain aggregate to a response DTO.
 * Exported for testing.
 */
export function mapReviewToResponse(review: AIOutputReview) {
  return {
    id:
      typeof review.id === 'object' && review.id !== null
        ? (review.id as any).toString()
        : String(review.id),
    tenantId: review.tenantId,
    outputType: review.outputType,
    outputPayload: review.outputPayload,
    confidence:
      typeof review.confidence === 'object'
        ? ((review.confidence as any).value ?? review.confidence)
        : review.confidence,
    status: review.status,
    slaDeadline: review.slaDeadline,
    escalationDepth: review.escalationDepth,
    lockedBy: review.lockedBy ?? null,
    lockedAt: review.lockedAt ?? null,
    lockExpiresAt: review.lockExpiresAt ?? null,
    reviewerId: review.reviewerId ?? null,
    reviewDecision: review.reviewDecision ?? null,
    reviewNotes: review.reviewNotes ?? null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

// ============================================================
// Helper to map Prisma row to response DTO (for direct queries)
// ============================================================

function mapPrismaRowToResponse(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    outputType: row.outputType,
    outputPayload: row.outputPayload,
    confidence: row.confidence,
    status: row.status,
    slaDeadline: row.slaDeadline,
    escalationDepth: row.escalationDepth,
    lockedBy: row.lockedBy ?? null,
    lockedAt: row.lockedAt ?? null,
    lockExpiresAt: row.lockExpiresAt ?? null,
    reviewerId: row.reviewerId ?? null,
    reviewDecision: row.reviewDecision ?? null,
    reviewNotes: row.reviewNotes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ============================================================
// Router definition
// ============================================================

export const aiReviewRouter = createTRPCRouter({
  /**
   * List reviews with filtering and pagination
   * Uses direct Prisma query for full status filtering
   */
  list: tenantProcedure.input(reviewListFilterSchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const tenantId = typedCtx.tenant.tenantId;

    const page = input.page ?? 1;
    const limit = input.limit ?? 20;
    const offset = (page - 1) * limit;

    // Build where clause with all filters
    const where: Record<string, unknown> = { tenantId };

    if (input.status?.length) {
      where.status = { in: input.status };
    }
    if (input.outputType?.length) {
      where.outputType = { in: input.outputType };
    }
    if (input.minConfidence !== undefined || input.maxConfidence !== undefined) {
      where.confidence = {};
      if (input.minConfidence !== undefined) {
        (where.confidence as any).gte = input.minConfidence;
      }
      if (input.maxConfidence !== undefined) {
        (where.confidence as any).lte = input.maxConfidence;
      }
    }
    if (input.slaBreached === true) {
      where.slaDeadline = { lt: new Date() };
      if (!where.status) {
        where.status = { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] };
      }
    }
    if (input.escalationDepth !== undefined) {
      where.escalationDepth = input.escalationDepth;
    }
    if (input.reviewerId) {
      where.reviewerId = input.reviewerId;
    }

    // Sorting
    const sortBy = input.sortBy ?? 'createdAt';
    const sortOrder = input.sortOrder ?? 'desc';
    const orderBy = { [sortBy]: sortOrder };

    // Execute queries in parallel
    const [rows, total] = await Promise.all([
      (ctx.prisma as any).aIOutputReview.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
      }),
      (ctx.prisma as any).aIOutputReview.count({ where }),
    ]);

    return {
      data: rows.map(mapPrismaRowToResponse),
      total,
      page,
      limit,
      hasMore: offset + rows.length < total,
    };
  }),

  /**
   * Get a single review by ID
   */
  get: tenantProcedure.input(z.object({ reviewId: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const repository = await getRepository(ctx);

    const review = await repository.findById(input.reviewId, typedCtx.tenant.tenantId);

    if (!review) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Review not found',
      });
    }

    return mapReviewToResponse(review);
  }),

  /**
   * Claim a pending review for assessment
   * Acquires exclusive lock with HMAC-SHA256 token
   */
  claim: tenantProcedure
    .input(
      z.object({
        reviewId: idSchema,
        lockDurationMinutes: z.number().int().min(1).max(60).default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const app = await getApplicationModule();
      const useCase = new app.ClaimReviewUseCase(repository, eventBus, LOCK_TOKEN_SECRET);
      const result = await useCase.execute({
        reviewId: input.reviewId,
        tenantId: typedCtx.tenant.tenantId,
        userId: typedCtx.tenant.userId,
        lockDurationMinutes: input.lockDurationMinutes,
      });

      if (result.isFailure) {
        throw mapDomainErrorToTRPCError(result.error);
      }

      // Fetch updated review for response
      const updatedReview = await repository.findById(input.reviewId, typedCtx.tenant.tenantId);

      return {
        success: result.value.success,
        lockToken: result.value.lockToken,
        expiresAt: result.value.expiresAt,
        review: updatedReview ? mapReviewToResponse(updatedReview) : null,
      };
    }),

  /**
   * Approve a claimed review
   * Requires valid lock token
   */
  approve: tenantProcedure
    .input(
      z.object({
        reviewId: idSchema,
        lockToken: z.string().min(1),
        feedback: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const app = await getApplicationModule();
      const useCase = new app.ApproveReviewUseCase(repository, eventBus, LOCK_TOKEN_SECRET);
      const result = await useCase.execute({
        reviewId: input.reviewId,
        tenantId: typedCtx.tenant.tenantId,
        userId: typedCtx.tenant.userId,
        lockToken: input.lockToken,
        feedback: input.feedback,
      });

      if (result.isFailure) {
        throw mapDomainErrorToTRPCError(result.error);
      }

      // Fetch updated review for response
      const updatedReview = await repository.findById(input.reviewId, typedCtx.tenant.tenantId);

      return {
        success: true,
        review: updatedReview ? mapReviewToResponse(updatedReview) : null,
      };
    }),

  /**
   * Reject a claimed review with mandatory notes
   */
  reject: tenantProcedure
    .input(
      z.object({
        reviewId: idSchema,
        lockToken: z.string().min(1),
        notes: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const app = await getApplicationModule();
      const useCase = new app.RejectReviewUseCase(repository, eventBus, LOCK_TOKEN_SECRET);
      const result = await useCase.execute({
        reviewId: input.reviewId,
        tenantId: typedCtx.tenant.tenantId,
        userId: typedCtx.tenant.userId,
        lockToken: input.lockToken,
        notes: input.notes,
      });

      if (result.isFailure) {
        throw mapDomainErrorToTRPCError(result.error);
      }

      // Fetch updated review for response
      const updatedReview = await repository.findById(input.reviewId, typedCtx.tenant.tenantId);

      return {
        success: true,
        review: updatedReview ? mapReviewToResponse(updatedReview) : null,
      };
    }),

  /**
   * Escalate a review to higher authority
   * Max escalation depth: 3
   */
  escalate: tenantProcedure
    .input(
      z.object({
        reviewId: idSchema,
        lockToken: z.string().min(1),
        reason: z.string().min(1).max(2000),
        targetUserId: idSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const repository = await getRepository(ctx);

      const app = await getApplicationModule();
      const useCase = new app.EscalateReviewUseCase(repository, eventBus, LOCK_TOKEN_SECRET);
      const result = await useCase.execute({
        reviewId: input.reviewId,
        tenantId: typedCtx.tenant.tenantId,
        userId: typedCtx.tenant.userId,
        lockToken: input.lockToken,
        reason: input.reason,
        targetUserId: input.targetUserId,
      });

      if (result.isFailure) {
        throw mapDomainErrorToTRPCError(result.error);
      }

      // Fetch updated review for response
      const updatedReview = await repository.findById(input.reviewId, typedCtx.tenant.tenantId);

      return {
        success: true,
        escalationDepth: result.value.escalationDepth,
        review: updatedReview ? mapReviewToResponse(updatedReview) : null,
      };
    }),

  /**
   * Get review queue statistics
   * Uses direct Prisma groupBy for efficient aggregation
   */
  stats: tenantProcedure
    .input(
      z.object({
        outputType: aiOutputTypeSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;

      const where: Record<string, unknown> = { tenantId };
      if (input.outputType) {
        where.outputType = input.outputType;
      }

      // Run groupBy and SLA breached count in parallel
      const [statusCounts, slaBreachedCount] = await Promise.all([
        (ctx.prisma as any).aIOutputReview.groupBy({
          by: ['status'],
          where,
          _count: { status: true },
        }),
        (ctx.prisma as any).aIOutputReview.count({
          where: {
            ...where,
            slaDeadline: { lt: new Date() },
            status: { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] },
          },
        }),
      ]);

      // Map grouped results to stats object
      const countMap: Record<string, number> = {};
      for (const row of statusCounts) {
        countMap[row.status] = row._count.status;
      }

      const pending = countMap['PENDING'] ?? 0;
      const inReview = countMap['IN_REVIEW'] ?? 0;
      const approved = countMap['APPROVED'] ?? 0;
      const rejected = countMap['REJECTED'] ?? 0;
      const escalated = countMap['ESCALATED'] ?? 0;
      const expired = countMap['EXPIRED'] ?? 0;

      return {
        pending,
        inReview,
        approved,
        rejected,
        escalated,
        expired,
        slaBreachedCount,
        totalReviews: pending + inReview + approved + rejected + escalated + expired,
      };
    }),
});
