import type { AuditLogInput, ResourceType } from '../types';

export type BulkAction = 'BULK_UPDATE' | 'BULK_DELETE' | 'IMPORT' | 'EXPORT';

export interface BulkLogOptions {
  actorId?: string;
  actorEmail?: string;
  successCount?: number;
  failureCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create audit log input for bulk operation
 */
export function createBulkOperationEntry(
  action: BulkAction,
  resourceType: ResourceType,
  resourceIds: string[],
  tenantId: string,
  options: BulkLogOptions = {}
): AuditLogInput {
  return {
    tenantId,
    eventType: `Bulk${action.replace('BULK_', '')}`,
    action,
    actionResult: options.failureCount ? 'PARTIAL' : 'SUCCESS',
    resourceType,
    resourceId: resourceIds.join(','),
    actorId: options.actorId,
    actorEmail: options.actorEmail,
    metadata: {
      count: resourceIds.length,
      successCount: options.successCount,
      failureCount: options.failureCount,
      ...options.metadata,
    },
  };
}
