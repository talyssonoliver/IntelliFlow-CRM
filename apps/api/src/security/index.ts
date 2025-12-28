/**
 * Security Module - Main Export
 *
 * Exports all security-related functionality for RBAC/ABAC and audit logging.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 *
 * Usage:
 * ```typescript
 * import {
 *   AuditLogger,
 *   RBACService,
 *   requirePermission,
 *   auditLog,
 *   Permissions,
 * } from './security';
 * ```
 */

// Types
export * from './types';

// Audit Logger
export { AuditLogger, getAuditLogger, resetAuditLogger } from './audit-logger';

// RBAC Service
export { RBACService, getRBACService, resetRBACService, Permissions } from './rbac';

// Middleware
export {
  createSecurityContextMiddleware,
  requirePermission,
  auditLog,
  securedAction,
  requireAdmin,
  requireManager,
  requireRole,
  requireOwnership,
} from './middleware';
export type { SecurityContext } from './middleware';
