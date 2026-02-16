/**
 * Chain Version Domain Events - Re-export from canonical location
 *
 * IFC-086: Model Versioning with Zep
 *
 * The canonical implementation lives in `packages/domain/src/ai/ChainVersionEvents.ts`.
 * This module re-exports it for the planned ai/events/ path.
 */
export {
  ChainVersionCreatedEvent,
  ChainVersionActivatedEvent,
  ChainVersionDeprecatedEvent,
  ChainVersionRolledBackEvent,
} from '../ChainVersionEvents';
