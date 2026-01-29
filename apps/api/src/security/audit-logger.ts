/**
 * Audit Logger Service
 *
 * DEPRECATED: This file re-exports from the refactored audit module.
 * Import from './audit' instead for new code.
 *
 * @see ./audit/index.ts for the refactored module
 */

// Re-export everything for backward compatibility
export {
  AuditLogger,
  getAuditLogger,
  resetAuditLogger,
} from './audit';

export type {
  AuditLoggerConfig,
} from './audit';
