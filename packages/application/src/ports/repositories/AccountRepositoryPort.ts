/**
 * Account Repository Port
 * Re-exports from domain layer for hexagonal architecture
 *
 * The domain layer defines the entity and repository contract.
 * The application layer re-exports for use case dependencies.
 * The adapters layer provides implementations.
 */

// Re-export all Account-related types from domain
export type {
  Account,
  AccountId,
  AccountRepository,
  AccountQueryService,
  AccountSearchParams,
  AccountSearchResult,
  AccountStatistics,
} from '@intelliflow/domain';
