/**
 * Chain Version Service - Re-export from canonical location
 *
 * IFC-086: Model Versioning with Zep
 *
 * The canonical implementation lives in `packages/application/src/services/ChainVersionService.ts`.
 * This module re-exports it for the planned usecases/chain-version/ path.
 */
export {
  ChainVersionService,
  ChainVersionCreatedEvent,
  ChainVersionActivatedEvent,
  ChainVersionDeprecatedEvent,
  ChainVersionRolledBackEvent,
  type ChainVersionRecord,
  type ChainVersionAuditRecord,
  type ChainVersionRepositoryPort,
  type ChainVersionAuditRepositoryPort,
  type FeatureFlagProviderPort,
} from '../../services/ChainVersionService';
