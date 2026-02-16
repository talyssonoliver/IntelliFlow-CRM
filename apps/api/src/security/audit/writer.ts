import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuditLogInput, RequiredAuditLoggerConfig } from './types';
import { getAuditEncryption } from '../../shared/audit-encryption-module';

/**
 * Validate that the tenantId exists in the database
 * Returns false if tenantId is empty or doesn't exist
 */
async function validateTenant(prisma: PrismaClient, tenantId: string): Promise<boolean> {
  if (!tenantId || tenantId.trim() === '') {
    return false;
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    return !!tenant;
  } catch (error) {
    console.warn('[AUDIT] Failed to validate tenant:', error);
    return false;
  }
}

/**
 * Write an audit log entry to the database
 *
 * Per ADR-008, writes to the consolidated AuditLogEntry table.
 * This is the single source of truth for audit logs.
 *
 * If the tenantId is invalid (empty or doesn't exist), logs to console only
 * to avoid foreign key constraint violations.
 */
export async function writeEntry(
  prisma: PrismaClient,
  entry: AuditLogInput,
  config: RequiredAuditLoggerConfig
): Promise<string> {
  try {
    // Validate tenant exists before attempting DB write
    const tenantValid = await validateTenant(prisma, entry.tenantId);

    if (!tenantValid) {
      // Log to console only if tenant is invalid
      const eventId = entry.eventId || randomUUID();
      console.warn(
        `[AUDIT] Skipping DB write - invalid tenantId "${entry.tenantId}". ` +
          `Event: ${entry.action} ${entry.resourceType}/${entry.resourceId} by ${entry.actorId || 'system'}`
      );
      return eventId;
    }

    // Optionally encrypt sensitive fields (IFC-124)
    let beforeState = entry.beforeState as object | undefined;
    let afterState = entry.afterState as object | undefined;
    let metadata = entry.metadata as object | undefined;

    if (config.encryptSensitiveFields) {
      try {
        const encryptor = getAuditEncryption();
        if (beforeState) {
          beforeState = {
            _encrypted: true,
            ...encryptor.encryptAuditLog(beforeState as Record<string, unknown>),
          };
        }
        if (afterState) {
          afterState = {
            _encrypted: true,
            ...encryptor.encryptAuditLog(afterState as Record<string, unknown>),
          };
        }
        if (metadata) {
          metadata = {
            _encrypted: true,
            ...encryptor.encryptAuditLog(metadata as Record<string, unknown>),
          };
        }
      } catch (encError) {
        console.warn('[AUDIT] Encryption failed, writing plaintext:', encError);
      }
    }

    // Write to consolidated AuditLogEntry table
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
        beforeState,
        afterState,
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
        metadata,
      },
    });

    return auditLogEntry.id;
  } catch (error) {
    console.error('[AUDIT] Failed to write audit log:', error);
    throw error;
  }
}
