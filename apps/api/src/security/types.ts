/**
 * Security Types
 *
 * Type definitions for RBAC/ABAC and audit logging.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 */

/**
 * Actor types for audit logging
 */
export type ActorType = 'USER' | 'SYSTEM' | 'AI_AGENT' | 'API_KEY' | 'WEBHOOK';

/**
 * Standard audit actions
 */
export type AuditAction =
  // Standard CRUD
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  // Authentication/Authorization
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_RESET'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'PERMISSION_DENIED'
  // CRM-specific
  | 'QUALIFY'
  | 'CONVERT'
  | 'ASSIGN'
  | 'TRANSFER'
  | 'SCORE'
  // AI actions
  | 'AI_SCORE'
  | 'AI_PREDICT'
  | 'AI_GENERATE'
  // Bulk operations
  | 'BULK_UPDATE'
  | 'BULK_DELETE'
  | 'IMPORT'
  | 'EXPORT'
  // System
  | 'ARCHIVE'
  | 'RESTORE'
  | 'CONFIGURE';

/**
 * Action result types
 */
export type ActionResult = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'PARTIAL';

/**
 * Data classification levels
 */
export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'PRIVILEGED';

/**
 * Security event types
 */
export type SecurityEventType =
  | 'LOGIN_ATTEMPT'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'MFA_CHALLENGE'
  | 'MFA_SUCCESS'
  | 'MFA_FAILURE'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'BRUTE_FORCE_DETECTED'
  | 'SESSION_HIJACK_ATTEMPT'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'DATA_EXPORT'
  | 'ADMIN_ACTION';

/**
 * Security severity levels
 */
export type SecuritySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * CRM Resource types
 */
export type ResourceType =
  | 'lead'
  | 'contact'
  | 'account'
  | 'opportunity'
  | 'task'
  | 'user'
  | 'ai_score'
  | 'appointment'
  | 'system';

/**
 * Permission actions
 */
export type PermissionAction = 'read' | 'write' | 'delete' | 'export' | 'manage' | 'admin';

/**
 * Permission identifier format: "resource:action"
 * Examples: "leads:read", "contacts:write", "admin:users"
 */
export type PermissionId = `${ResourceType}:${PermissionAction}` | `admin:${string}`;

/**
 * Standard roles
 */
export type RoleName = 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'USER' | 'VIEWER';

/**
 * Role hierarchy levels (higher = more privileges)
 */
export const ROLE_LEVELS: Record<RoleName, number> = {
  VIEWER: 0,
  USER: 10,
  SALES_REP: 20,
  MANAGER: 30,
  ADMIN: 100,
};

/**
 * Audit log entry for creating new audit records
 */
export interface AuditLogInput {
  eventType: string;
  eventId?: string;
  actorType?: ActorType;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName?: string;
  action: AuditAction;
  actionResult?: ActionResult;
  actionReason?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  changedFields?: string[];
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  traceId?: string;
  sessionId?: string;
  dataClassification?: DataClassification;
  requiredPermission?: string;
  permissionGranted?: boolean;
  permissionDeniedReason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Security event input for creating security events
 */
export interface SecurityEventInput {
  eventType: SecurityEventType;
  severity?: SecuritySeverity;
  actorId?: string;
  actorEmail?: string;
  actorIp?: string;
  description: string;
  details?: Record<string, unknown>;
  detected?: boolean;
  detectedBy?: string;
  blocked?: boolean;
  alertSent?: boolean;
}

/**
 * Permission check context
 */
export interface PermissionContext {
  userId: string;
  userRole: RoleName;
  resourceType: ResourceType;
  action: PermissionAction;
  resourceId?: string;
  resourceOwnerId?: string;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
  checkedPermissions: string[];
  roleLevel: number;
}

/**
 * ABAC attribute condition
 */
export interface AttributeCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'startsWith';
  value: string | string[];
}

/**
 * Request context for middleware
 */
export interface RequestContext {
  requestId?: string;
  traceId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}
