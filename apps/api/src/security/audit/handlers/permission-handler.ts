import type { AuditLogInput, ResourceType } from '../types';

export interface PermissionDeniedOptions {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create audit log input for permission denied event
 */
export function createPermissionDeniedEntry(
  resourceType: ResourceType,
  resourceId: string,
  requiredPermission: string,
  tenantId: string,
  options: PermissionDeniedOptions = {}
): AuditLogInput {
  return {
    tenantId,
    eventType: 'PermissionDenied',
    action: 'PERMISSION_DENIED',
    actionResult: 'DENIED',
    resourceType,
    resourceId,
    actorId: options.actorId,
    actorEmail: options.actorEmail,
    actorRole: options.actorRole,
    requiredPermission,
    permissionGranted: false,
    permissionDeniedReason: options.reason || `Missing permission: ${requiredPermission}`,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  };
}
