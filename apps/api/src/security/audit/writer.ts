import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuditLogInput, RequiredAuditLoggerConfig } from './types';

/**
 * Write an audit log entry to the database
 *
 * Writes to both the comprehensive AuditLogEntry table (if available)
 * and the basic AuditLog table for backward compatibility.
 */
export async function writeEntry(
  prisma: PrismaClient,
  entry: AuditLogInput,
  config: RequiredAuditLoggerConfig
): Promise<string> {
  try {
    // Try comprehensive table first
    const entryId = await writeComprehensiveEntry(prisma, entry, config);
    if (entryId) {
      return entryId;
    }

    // Fall back to basic AuditLog table
    const auditLog = await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.resourceType,
        entityId: entry.resourceId,
        oldValue: entry.beforeState as object | undefined,
        newValue: entry.afterState as object | undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        userId: entry.actorId || 'system',
        tenantId: entry.tenantId,
      },
    });

    return auditLog.id;
  } catch (error) {
    console.error('[AUDIT] Failed to write audit log:', error);
    throw error;
  }
}

/**
 * Write to the comprehensive AuditLogEntry table
 */
async function writeComprehensiveEntry(
  prisma: PrismaClient,
  entry: AuditLogInput,
  config: RequiredAuditLoggerConfig
): Promise<string | null> {
  try {
    if (!prisma.auditLogEntry) {
      return null;
    }

    const auditLogEntry = await prisma.auditLogEntry.create({
      data: {
        tenantId: entry.tenantId,
        eventType: entry.eventType,
        eventVersion: entry.eventVersion ?? 'v1',
        eventId: entry.eventId || randomUUID(),
        actorType: entry.actorType ?? 'USER',
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        actorRole: entry.actorRole,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        resourceName: entry.resourceName,
        action: entry.action,
        actionResult: entry.actionResult ?? 'SUCCESS',
        actionReason: entry.actionReason,
        beforeState: entry.beforeState as object | undefined,
        afterState: entry.afterState as object | undefined,
        changedFields: entry.changedFields ?? [],
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
        traceId: entry.traceId,
        sessionId: entry.sessionId,
        dataClassification: entry.dataClassification ?? config.defaultClassification,
        retentionExpiresAt: entry.retentionExpiresAt,
        requiredPermission: entry.requiredPermission,
        permissionGranted: entry.permissionGranted ?? true,
        permissionDeniedReason: entry.permissionDeniedReason,
        metadata: entry.metadata as object | undefined,
      },
    });

    return auditLogEntry.id;
  } catch (error) {
    console.debug('[AUDIT] Comprehensive entry failed, falling back to basic:', error);
    return null;
  }
}
