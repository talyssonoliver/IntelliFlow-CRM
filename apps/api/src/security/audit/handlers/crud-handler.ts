import type {
  AuditLogInput,
  AuditAction,
  ActorType,
  ResourceType,
  DataClassification,
} from '../types';
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
  /**
   * Override the derived eventType with a canonical name (e.g. 'LeadQualified').
   * The default derivation only yields valid names for CRUD verbs ending in 'e'
   * (Created/Updated/Deleted); non-CRUD actions (QUALIFY/CONVERT/READ/AI_SCORE)
   * must pass an explicit canonical eventType.
   */
  eventType?: string;
  /** Override the default data classification (e.g. 'CONFIDENTIAL' for PII). */
  dataClassification?: DataClassification;
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

  // Generate event type like "LeadCreated", "ContactUpdated". The derivation
  // only yields valid past-tense names for CRUD verbs ending in 'e'; callers
  // using non-CRUD actions pass an explicit canonical `eventType`.
  const eventType =
    options.eventType ??
    `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}${action.charAt(0) + action.slice(1).toLowerCase()}d`;

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
    dataClassification: options.dataClassification,
    ipAddress: options.requestContext?.ipAddress,
    userAgent: options.requestContext?.userAgent,
    requestId: options.requestContext?.requestId,
    traceId: options.requestContext?.traceId,
    sessionId: options.requestContext?.sessionId,
    metadata: options.metadata,
  };
}
