/**
 * PG-203 — the per-tenant public booking lock.
 *
 * A public booking reads the event type, availability and busy time under this
 * transaction-scoped advisory lock, then inserts the appointment. Every write that
 * changes what a booking may accept (event types, availability hours, closures,
 * settings) takes the same lock first, so a booking can never commit against a
 * configuration that was changed after it was read.
 */
import type { PrismaClient } from '@intelliflow/db';

export async function lockTenantBookings(
  tx: Pick<PrismaClient, '$executeRaw'>,
  tenantId: string
): Promise<void> {
  const lockKey = `booking:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}
