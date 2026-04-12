import { PrismaClient } from '@intelliflow/db';
import { randomUUID } from 'node:crypto';
import type { SecurityEventInput } from '../types';
import { getSeverityMarker } from '../utils';
import { getAIEventSeverity, isAISecurityEventType } from '@intelliflow/domain';

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
    console.warn('[SECURITY] Failed to validate tenant:', error);
    return false;
  }
}

/**
 * Log a security event to the database
 *
 * If the tenantId is invalid (empty or doesn't exist), logs to console only
 * to avoid foreign key constraint violations.
 */
export async function logSecurityEventToDb(
  prisma: PrismaClient,
  input: SecurityEventInput,
  consoleLog: boolean
): Promise<string> {
  // Auto-determine severity for AI security events if not provided
  let severity = input.severity || 'INFO';
  if (isAISecurityEventType(input.eventType)) {
    severity = input.severity || getAIEventSeverity(input.eventType);
  }

  const marker = getSeverityMarker(severity);

  if (consoleLog) {
    console.log(`[SECURITY] ${marker} ${input.eventType}: ${input.description}`);
  }

  // Validate tenant exists before attempting DB write
  const tenantValid = await validateTenant(prisma, input.tenantId);

  if (!tenantValid) {
    // Log to console only if tenant is invalid
    const eventId = randomUUID();
    console.warn(
      `[SECURITY] Skipping DB write - invalid tenantId "${input.tenantId}". ` +
        `Event: ${input.eventType} (${marker})`
    );
    return eventId;
  }

  const event = await prisma.securityEvent?.create({
    data: {
      eventType: input.eventType,
      severity,
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      actorIp: input.actorIp,
      description: input.description,
      details: input.details as object | undefined,
      detected: input.detected ?? false,
      detectedBy: input.detectedBy,
      blocked: input.blocked ?? false,
      alertSent: input.alertSent ?? false,
    },
  });

  return event?.id ?? randomUUID();
}
