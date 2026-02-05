/**
 * AI Output Review Repository Port (IFC-177)
 *
 * Re-exports the repository interface from domain layer.
 * This file exists to make the architecture explicit:
 * - Domain defines the contract
 * - Application uses the port
 * - Adapters implement the port
 *
 * @module ai-review-repository-port
 * @implements IFC-177
 */
export type { IAIOutputReviewRepository, AIReviewQueryOptions } from '@intelliflow/domain';
