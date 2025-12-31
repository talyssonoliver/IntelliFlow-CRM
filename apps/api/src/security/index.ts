/**
 * Security Module - Main Export
 *
 * Exports all security-related functionality for RBAC/ABAC, audit logging,
 * multi-tenant isolation, and encryption.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 * IMPLEMENTS: IFC-113 (Secrets Management & Encryption)
 * IMPLEMENTS: IFC-127 (Tenant Isolation)
 *
 * Usage:
 * ```typescript
 * import {
 *   AuditLogger,
 *   RBACService,
 *   requirePermission,
 *   auditLog,
 *   Permissions,
 *   tenantContextMiddleware,
 *   rateLimitMiddleware,
 *   EncryptionService,
 *   KeyRotationService,
 * } from './security';
 * ```
 */

// Types
export * from './types';

// Audit Logger
export { AuditLogger, getAuditLogger, resetAuditLogger } from './audit-logger';

// Audit Event Handler (Domain Event to Audit Log conversion - ADR-008)
export {
  AuditEventHandler,
  getAuditEventHandler,
  resetAuditEventHandler,
  auditDomainEvent,
} from './audit-event-handler';
export type { DomainEventPayload, AuditEventResult } from './audit-event-handler';

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

// Tenant Context (IFC-127)
export {
  extractTenantContext,
  createTenantScopedPrisma,
  tenantContextMiddleware,
  verifyTenantAccess,
  createTenantWhereClause,
  validateTenantOperation,
  getTeamMemberIds,
  enrichTenantContext,
  hasTenantContext,
  assertTenantContext,
} from './tenant-context';
export type { TenantContext, TenantAwareContext } from './tenant-context';

// Tenant Resource Limiter (IFC-127)
export {
  getTenantLimits,
  checkResourceUsage,
  enforceResourceLimit,
  rateLimitMiddleware,
  concurrentRequestMiddleware,
  resourceLimitMiddleware,
  getAllResourceUsage,
  checkApproachingLimits,
  clearRateLimitState,
  DEFAULT_LIMITS,
} from './tenant-limiter';
export type { TenantLimits, ResourceUsage } from './tenant-limiter';

// Encryption Service (IFC-113)
export {
  EncryptionService,
  EncryptionError,
  EnvironmentKeyProvider,
  VaultKeyProvider,
  FieldEncryption,
  getEncryptionService,
  resetEncryptionService,
} from './encryption';
export type {
  EncryptedData,
  EncryptionOptions,
  KeyMetadata,
  KeyProvider,
} from './encryption';

// Key Rotation Service (IFC-113)
export {
  KeyRotationService,
  InMemoryKeyVersionStore,
  VaultKeyVersionStore,
  getKeyRotationService,
  resetKeyRotationService,
} from './key-rotation';
export type {
  KeyRotationConfig,
  RotationResult,
  ReEncryptionProgress,
  DataProvider,
  EncryptedRecord,
  KeyLifecycleEvent,
  KeyLifecycleEventRecord,
  KeyVersionStore,
} from './key-rotation';
