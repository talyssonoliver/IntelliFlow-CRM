import type { AuditLogInput, AuditAction, ActorType, ResourceType } from '../types';
import { calculateChangedFields } from '../utils';

export interface CrudLogOptions {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorType?: ActorType;
  resourceName?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  actionReason?: string;
  requestContext?: {
    requestId?: string;
    traceId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Create audit log input for CRUD action
 */
export function createCrudEntry(
  action: AuditAction,
  resourceType: ResourceType,
  resourceId: string,
  tenantId: string,
  options: CrudLogOptions = {}
): AuditLogInput {
  const changedFields = calculateChangedFields(options.beforeState, options.afterState);

  // Generate event type like "LeadCreated", "ContactUpdated"
  const eventType = `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}${action.charAt(0) + action.slice(1).toLowerCase()}d`;

  return {
    tenantId,
    eventType,
    action,
    resourceType,
    resourceId,
    resourceName: options.resourceName,
    actorId: options.actorId,
    actorEmail: options.actorEmail,
    actorRole: options.actorRole,
    actorType: options.actorType ?? 'USER',
    beforeState: options.beforeState,
    afterState: options.afterState,
    changedFields,
    actionReason: options.actionReason,
    ipAddress: options.requestContext?.ipAddress,
    userAgent: options.requestContext?.userAgent,
    requestId: options.requestContext?.requestId,
    traceId: options.requestContext?.traceId,
    sessionId: options.requestContext?.sessionId,
    metadata: options.metadata,
  };
}
