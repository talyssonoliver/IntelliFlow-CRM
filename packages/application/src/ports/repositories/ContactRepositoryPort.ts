/**
 * Contact Repository Port
 * Re-exports from domain layer for hexagonal architecture
 *
 * The domain layer defines the entity and repository contract.
 * The application layer re-exports for use case dependencies.
 * The adapters layer provides implementations.
 */

// Re-export all Contact-related types from domain
export type {
  Contact,
  ContactId,
  ContactRepository,
  ContactQueryService,
  ContactSearchParams,
  ContactSearchResult,
  ContactStatistics,
} from '@intelliflow/domain';
