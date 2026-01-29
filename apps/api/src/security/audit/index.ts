/**
 * Audit Module
 *
 * Provides comprehensive audit logging for the CRM system.
 * Refactored from monolithic audit-logger.ts into modular components.
 */

import { PrismaClient } from '@prisma/client';
import { AuditLogger } from './audit-logger';

export { AuditLogger } from './audit-logger';

// Type exports from types module
export type {
  AuditLogInput,
  SecurityEventInput,
  AuditAction,
  ActionResult,
  ActorType,
  DataClassification,
  ResourceType,
  SecuritySeverity,
  AuditLoggerConfig,
  RequiredAuditLoggerConfig,
} from './types';

// Re-export handlers for direct use
export {
  createLoginSuccessEntry,
  createLoginFailureEntry,
  createCrudEntry,
  createPermissionDeniedEntry,
  createBulkOperationEntry,
} from './handlers';

// Type exports from handlers
export type {
  CrudLogOptions,
  BulkAction,
  BulkLogOptions,
  AuthLogOptions,
  PermissionDeniedOptions,
} from './handlers';

// Re-export queries
export {
  queryComprehensive,
  queryBasic,
  getResourceAuditTrail,
  getActorAuditTrail,
  getPermissionAuditTrail,
} from './queries';

// Type exports from queries
export type { QueryFilters, QueryResult } from './queries';

// Re-export utils
export { prepareEntry, calculateChangedFields, buildWhereClause, getSeverityMarker } from './utils';

// Re-export writer
export { writeEntry } from './writer';

// Import type for singleton function
import type { AuditLoggerConfig } from './types';

/**
 * Create a singleton audit logger instance
 */
let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(prisma: PrismaClient, config?: AuditLoggerConfig): AuditLogger {
  auditLoggerInstance ??= new AuditLogger(prisma, config);
  return auditLoggerInstance;
}

/**
 * Reset the audit logger instance (for testing)
 */
export function resetAuditLogger(): void {
  auditLoggerInstance = null;
}
