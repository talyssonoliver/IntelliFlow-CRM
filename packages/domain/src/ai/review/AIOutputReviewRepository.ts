/**
 * AI Output Review Repository Interface (IFC-177)
 *
 * Domain layer interface for AI Output Review persistence.
 * Follows DDD principles - interface defined in domain, implemented in adapters.
 *
 * @module ai-review-repository
 * @implements IFC-177
 */

import type { AIOutputReview } from './AIOutputReview';

/**
 * Query options for listing AI output reviews
 */
export interface AIReviewQueryOptions {
  /** Filter by output type */
  outputType?: string;
  /** Maximum number of items to return */
  limit?: number;
  /** Number of items to skip */
  offset?: number;
}

/**
 * Repository interface for AI Output Review aggregate.
 * Defined in domain layer following DDD principles.
 *
 * All methods enforce tenant isolation - tenantId is required for all queries.
 * This prevents cross-tenant data access at the persistence level.
 */
export interface IAIOutputReviewRepository {
  /**
   * Find a review by ID within a tenant.
   * Returns null if not found or belongs to different tenant.
   *
   * @param id - Review ID
   * @param tenantId - Tenant ID for isolation
   * @returns The review or null if not found
   */
  findById(id: string, tenantId: string): Promise<AIOutputReview | null>;

  /**
   * Find a review by ID with row-level locking for update.
   * Used for concurrent modification protection (SELECT FOR UPDATE).
   *
   * @param id - Review ID
   * @param tenantId - Tenant ID for isolation
   * @returns The review or null if not found
   */
  findByIdForUpdate(id: string, tenantId: string): Promise<AIOutputReview | null>;

  /**
   * Save or update a review.
   * Uses optimistic locking via version field internally.
   *
   * @param review - The review to save
   * @throws ConcurrentModificationError if version conflict
   */
  save(review: AIOutputReview): Promise<void>;

  /**
   * Save with explicit version check.
   * Returns false if version mismatch (concurrent modification detected).
   *
   * @param review - The review to save
   * @param expectedVersion - Expected version number
   * @returns true if saved, false if version conflict
   */
  saveWithOptimisticLock(review: AIOutputReview, expectedVersion: number): Promise<boolean>;

  /**
   * Find pending reviews for a tenant.
   * Supports filtering by output type and pagination.
   *
   * @param tenantId - Tenant ID for isolation
   * @param options - Optional filtering and pagination
   * @returns Array of pending reviews
   */
  findPending(tenantId: string, options?: AIReviewQueryOptions): Promise<AIOutputReview[]>;

  /**
   * Count pending reviews for a tenant.
   * Useful for pagination and queue metrics.
   *
   * @param tenantId - Tenant ID for isolation
   * @param outputType - Optional filter by output type
   * @returns Count of pending reviews
   */
  countPending(tenantId: string, outputType?: string): Promise<number>;

  /**
   * Find reviews with expired locks (for background cleanup).
   * Returns reviews where lockExpiresAt < cutoffTime.
   *
   * @param cutoffTime - Time threshold for expired locks
   * @returns Array of reviews with expired locks
   */
  findWithExpiredLocks(cutoffTime: Date): Promise<AIOutputReview[]>;
}
