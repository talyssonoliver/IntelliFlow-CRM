/**
 * Data Synchronization Utility
 *
 * DEPRECATED: This file re-exports from the refactored data-sync module.
 * Import from './data-sync' directory instead for new code.
 *
 * @see ./data-sync/index.ts for the refactored module
 */

// Re-export everything for backward compatibility
export {
  syncAllMetrics,
  syncMetricsFromCSV,
  formatSyncResult,
  validateMetricsConsistency,
} from './data-sync/index';

export type { SyncResult, ValidationResult } from './data-sync/index';
