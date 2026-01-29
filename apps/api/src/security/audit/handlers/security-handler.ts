import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { SecurityEventInput } from '../types';
import { getSeverityMarker } from '../utils';

/**
 * Log a security event to the database
 */
export async function logSecurityEventToDb(
  prisma: PrismaClient,
  input: SecurityEventInput,
  consoleLog: boolean
): Promise<string> {
  if (consoleLog) {
    const marker = getSeverityMarker(input.severity || 'INFO');
    console.log(`[SECURITY] ${marker} ${input.eventType}: ${input.description}`);
  }

  const event = await prisma.securityEvent?.create({
    data: {
      eventType: input.eventType,
      severity: input.severity ?? 'INFO',
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
