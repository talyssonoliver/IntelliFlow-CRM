/**
 * Opportunity Repository Port
 * Re-exports from domain layer for hexagonal architecture
 *
 * The domain layer defines the entity and repository contract.
 * The application layer re-exports for use case dependencies.
 * The adapters layer provides implementations.
 */

// Re-export all Opportunity-related types from domain
export type {
  Opportunity,
  OpportunityId,
  OpportunityRepository,
  OpportunityQueryService,
  OpportunitySearchParams,
  OpportunitySearchResult,
  OpportunityStatistics,
  PipelineMetrics,
  StageMetrics,
  WinRateAnalysis,
} from '@intelliflow/domain';
