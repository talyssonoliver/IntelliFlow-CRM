/**
 * PrismaAIOutputReviewRepository (IFC-179)
 *
 * Prisma implementation of IAIOutputReviewRepository port.
 * Implements hexagonal architecture pattern with:
 * - Tenant isolation (tenantId in all queries)
 * - Optimistic locking (version field)
 * - Pessimistic locking (SELECT FOR UPDATE for claims)
 *
 * @module ai-output-review-repository
 * @implements IFC-179
 */

import {
  PrismaClient,
  Prisma,
  AIOutputReview as PrismaReviewRecord,
  ReviewStatus as PrismaReviewStatus,
  ReviewDecision as PrismaReviewDecision,
} from '@intelliflow/db';
import {
  AIOutputReview,
  ReviewStatus,
  ReviewDecision,
  AIOutputType,
  IAIOutputReviewRepository,
  AIReviewQueryOptions,
} from '@intelliflow/domain';

/**
 * Custom error for optimistic locking conflicts.
 * Thrown when a concurrent modification is detected during save.
 */
export class OptimisticLockError extends Error {
  readonly code = 'OPTIMISTIC_LOCK_ERROR';
  readonly entityType: string;
  readonly entityId: string;

  constructor(entityType: string, entityId: string) {
    super(`Concurrent modification detected for ${entityType} with id ${entityId}`);
    this.name = 'OptimisticLockError';
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

/**
 * Raw query result type for SELECT FOR UPDATE
 * Maps snake_case DB columns to camelCase
 */
interface RawReviewRecord {
  id: string;
  tenantId: string;
  outputType: string;
  outputPayload: unknown;
  confidence: number;
  status: string;
  slaDeadline: Date;
  escalationDepth: number;
  lockedBy: string | null;
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
  reviewerId: string | null;
  reviewDecision: string | null;
  reviewNotes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Prisma implementation of AI Output Review Repository
 *
 * Implements all 7 methods from IAIOutputReviewRepository:
 * - findById: Basic lookup with tenant isolation
 * - findByIdForUpdate: SELECT FOR UPDATE for claim operations
 * - save: Upsert with implicit optimistic locking
 * - saveWithOptimisticLock: Save only if version matches
 * - findPending: Queue of pending reviews
 * - countPending: Count for pagination
 * - findWithExpiredLocks: Background job to find stale locks
 */
export class PrismaAIOutputReviewRepository implements IAIOutputReviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Map Prisma record to domain aggregate.
   * Uses AIOutputReview.reconstitute() to avoid emitting domain events.
   */
  private toDomain(record: PrismaReviewRecord | RawReviewRecord): AIOutputReview {
    return AIOutputReview.reconstitute(
      record.id,
      record.tenantId,
      record.outputType as AIOutputType,
      record.outputPayload,
      record.confidence,
      record.status as ReviewStatus,
      record.slaDeadline,
      record.escalationDepth,
      record.lockedBy ?? undefined,
      record.lockedAt ?? undefined,
      record.lockExpiresAt ?? undefined,
      record.reviewerId ?? undefined,
      record.reviewDecision as ReviewDecision | undefined ?? undefined,
      record.reviewNotes ?? undefined
    );
  }

  /**
   * Map domain aggregate to Prisma input.
   * Converts value objects to primitive types for persistence.
   */
  private toPersistence(review: AIOutputReview): {
    id: string;
    tenantId: string;
    outputType: AIOutputType;
    outputPayload: Prisma.InputJsonValue;
    confidence: number;
    status: PrismaReviewStatus;
    slaDeadline: Date;
    escalationDepth: number;
    lockedBy: string | null;
    lockedAt: Date | null;
    lockExpiresAt: Date | null;
    reviewerId: string | null;
    reviewDecision: PrismaReviewDecision | null;
    reviewNotes: string | null;
  } {
    return {
      id: review.id.toValue(),
      tenantId: review.tenantId,
      outputType: review.outputType,
      outputPayload: review.outputPayload as Prisma.InputJsonValue,
      confidence: review.confidence.toValue(),
      status: review.status as PrismaReviewStatus,
      slaDeadline: review.slaDeadline,
      escalationDepth: review.escalationDepth,
      lockedBy: review.lockedBy ?? null,
      lockedAt: review.lockedAt ?? null,
      lockExpiresAt: review.lockExpiresAt ?? null,
      reviewerId: review.reviewerId ?? null,
      reviewDecision: review.reviewDecision as PrismaReviewDecision ?? null,
      reviewNotes: review.reviewNotes ?? null,
    };
  }

  /**
   * Find a review by ID within a tenant.
   * Returns null if not found or belongs to different tenant.
   */
  async findById(id: string, tenantId: string): Promise<AIOutputReview | null> {
    const record = await this.prisma.aIOutputReview.findUnique({
      where: { id, tenantId },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  /**
   * Find a review by ID with row-level locking for update.
   * Uses SELECT FOR UPDATE to prevent concurrent modifications.
   * Required for claim operations to ensure atomic state transitions.
   */
  async findByIdForUpdate(id: string, tenantId: string): Promise<AIOutputReview | null> {
    // Raw query required for FOR UPDATE clause
    // Prisma doesn't support SELECT FOR UPDATE natively
    const records = await this.prisma.$queryRaw<RawReviewRecord[]>`
      SELECT
        id,
        tenant_id AS "tenantId",
        output_type AS "outputType",
        output_payload AS "outputPayload",
        confidence,
        status,
        sla_deadline AS "slaDeadline",
        escalation_depth AS "escalationDepth",
        locked_by AS "lockedBy",
        locked_at AS "lockedAt",
        lock_expires_at AS "lockExpiresAt",
        reviewer_id AS "reviewerId",
        review_decision AS "reviewDecision",
        review_notes AS "reviewNotes",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM ai_output_reviews
      WHERE id = ${id} AND tenant_id = ${tenantId}
      FOR UPDATE
    `;

    if (records.length === 0) return null;
    return this.toDomain(records[0]);
  }

  /**
   * Save or update a review.
   * Uses optimistic locking via version field.
   *
   * @throws OptimisticLockError if version conflict detected
   */
  async save(review: AIOutputReview): Promise<void> {
    const data = this.toPersistence(review);
    const id = review.id.toValue();

    // Check if record exists
    const existing = await this.prisma.aIOutputReview.findUnique({
      where: { id },
      select: { version: true },
    });

    if (!existing) {
      // Create new with version 0
      await this.prisma.aIOutputReview.create({
        data: {
          ...data,
          version: 0,
        },
      });
      return;
    }

    // Update with version check (optimistic lock)
    const previousVersion = existing.version;
    const result = await this.prisma.aIOutputReview.updateMany({
      where: {
        id,
        tenantId: data.tenantId, // CRITICAL: tenant isolation
        version: previousVersion,
      },
      data: {
        ...data,
        version: previousVersion + 1,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new OptimisticLockError('AIOutputReview', id);
    }
  }

  /**
   * Save with explicit version check.
   * Returns false if version mismatch (concurrent modification detected).
   * Does NOT throw errors, only returns boolean.
   */
  async saveWithOptimisticLock(review: AIOutputReview, expectedVersion: number): Promise<boolean> {
    const data = this.toPersistence(review);

    const result = await this.prisma.aIOutputReview.updateMany({
      where: {
        id: review.id.toValue(),
        tenantId: data.tenantId,
        version: expectedVersion,
      },
      data: {
        ...data,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  /**
   * Find pending reviews for a tenant.
   * Filters by PENDING and ESCALATED statuses (items in queue).
   * Supports filtering by output type and pagination.
   */
  async findPending(
    tenantId: string,
    options?: AIReviewQueryOptions
  ): Promise<AIOutputReview[]> {
    const records = await this.prisma.aIOutputReview.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'ESCALATED'] },
        ...(options?.outputType && { outputType: options.outputType as AIOutputType }),
      },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  /**
   * Count pending reviews for a tenant.
   * Useful for pagination and queue metrics.
   */
  async countPending(tenantId: string, outputType?: string): Promise<number> {
    return this.prisma.aIOutputReview.count({
      where: {
        tenantId,
        status: { in: ['PENDING', 'ESCALATED'] },
        ...(outputType && { outputType: outputType as AIOutputType }),
      },
    });
  }

  /**
   * Find reviews with expired locks (for background cleanup).
   * Returns reviews where status is IN_REVIEW and lockExpiresAt < cutoffTime.
   * Used by background job to release stale locks.
   */
  async findWithExpiredLocks(cutoffTime: Date): Promise<AIOutputReview[]> {
    const records = await this.prisma.aIOutputReview.findMany({
      where: {
        status: 'IN_REVIEW',
        lockExpiresAt: { lt: cutoffTime },
      },
    });

    return records.map((r) => this.toDomain(r));
  }
}
