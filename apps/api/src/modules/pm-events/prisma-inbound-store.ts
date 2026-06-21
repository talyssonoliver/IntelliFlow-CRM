/**
 * Prisma-backed inbound PM-event ledger (CRM-PR-A). Uses raw SQL (`$executeRaw` /
 * `$queryRaw`) against `portal_pm_deliveries` so it compiles without depending on the
 * generated model accessor, and so the UNIQUE(idempotency_key) constraint — not app
 * memory — resolves concurrency: `INSERT … ON CONFLICT DO NOTHING` makes a duplicate a
 * no-op (`created:false`).
 */
import type { PrismaClient } from '@intelliflow/db';
import type { InboundPmDeliveryRecord, InboundPmEventStore } from './inbound-store';

type RawPrisma = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

interface DeliveryRow {
  idempotencyKey: string;
  eventId: string;
  category: string;
  type: string;
  occurredAt: Date;
  receivedAt: Date;
  processingStatus: string;
  payloadHash: string;
  safeErrorCode: string | null;
}

export class PrismaInboundPmEventStore implements InboundPmEventStore {
  constructor(private readonly prisma: RawPrisma) {}

  async get(idempotencyKey: string): Promise<InboundPmDeliveryRecord | null> {
    const rows = await this.prisma.$queryRaw<DeliveryRow[]>`
      SELECT idempotency_key   AS "idempotencyKey",
             event_id          AS "eventId",
             category,
             type,
             occurred_at       AS "occurredAt",
             received_at       AS "receivedAt",
             processing_status AS "processingStatus",
             payload_hash      AS "payloadHash",
             safe_error_code   AS "safeErrorCode"
        FROM portal_pm_deliveries
       WHERE idempotency_key = ${idempotencyKey}
       LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      idempotencyKey: row.idempotencyKey,
      eventId: row.eventId,
      category: row.category,
      type: row.type,
      occurredAt: new Date(row.occurredAt).toISOString(),
      receivedAt: new Date(row.receivedAt).toISOString(),
      processingStatus: row.processingStatus as InboundPmDeliveryRecord['processingStatus'],
      payloadHash: row.payloadHash,
      safeErrorCode: row.safeErrorCode ?? undefined,
    };
  }

  async put(record: InboundPmDeliveryRecord): Promise<{ created: boolean }> {
    const affected = await this.prisma.$executeRaw`
      INSERT INTO portal_pm_deliveries
        (id, idempotency_key, event_id, category, type, occurred_at, received_at,
         processing_status, payload_hash, safe_error_code)
      VALUES
        (gen_random_uuid()::text, ${record.idempotencyKey}, ${record.eventId},
         ${record.category}, ${record.type}, ${record.occurredAt}::timestamp,
         ${record.receivedAt}::timestamp, ${record.processingStatus},
         ${record.payloadHash}, ${record.safeErrorCode ?? null})
      ON CONFLICT (idempotency_key) DO NOTHING`;
    return { created: affected > 0 };
  }
}
