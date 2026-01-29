import { randomUUID } from 'node:crypto';
import {
  AuditLogInput,
  DataClassification,
  RequiredAuditLoggerConfig,
  AuditAction,
  ActionResult,
  ActorType,
  ResourceType,
  SecuritySeverity,
} from './types';

/**
 * Prepare an audit log entry with defaults
 */
export function prepareEntry(
  input: AuditLogInput,
  config: RequiredAuditLoggerConfig
): AuditLogInput & { eventId: string; retentionExpiresAt: Date } {
  const retentionExpiresAt = new Date();
  retentionExpiresAt.setDate(retentionExpiresAt.getDate() + config.defaultRetentionDays);

  return {
    ...input,
    eventId: input.eventId || randomUUID(),
    actionResult: input.actionResult ?? 'SUCCESS',
    actorType: input.actorType ?? 'USER',
    dataClassification: input.dataClassification ?? config.defaultClassification,
    permissionGranted: input.permissionGranted ?? true,
    retentionExpiresAt,
  };
}

/**
 * Calculate changed fields between two states
 */
export function calculateChangedFields(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>
): string[] {
  if (!before && !after) return [];
  if (!before) return Object.keys(after || {});
  if (!after) return Object.keys(before);

  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

/**
 * Build the where clause for comprehensive queries
 */
export function buildWhereClause(filters: {
  resourceType?: ResourceType;
  resourceId?: string;
  actorId?: string;
  actorType?: ActorType;
  action?: AuditAction;
  actionResult?: ActionResult;
  eventType?: string;
  dataClassification?: DataClassification;
  traceId?: string;
  startDate?: Date;
  endDate?: Date;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.resourceId) where.resourceId = filters.resourceId;
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.actorType) where.actorType = filters.actorType;
  if (filters.action) where.action = filters.action;
  if (filters.actionResult) where.actionResult = filters.actionResult;
  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.dataClassification) where.dataClassification = filters.dataClassification;
  if (filters.traceId) where.traceId = filters.traceId;

  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) (where.timestamp as Record<string, Date>).gte = filters.startDate;
    if (filters.endDate) (where.timestamp as Record<string, Date>).lte = filters.endDate;
  }

  return where;
}

/**
 * Get marker for security severity (development logging)
 */
export function getSeverityMarker(severity: SecuritySeverity): string {
  switch (severity) {
    case 'CRITICAL':
      return '!!!';
    case 'HIGH':
      return '!!';
    case 'MEDIUM':
      return '!';
    case 'LOW':
      return '-';
    default:
      return '*';
  }
}
