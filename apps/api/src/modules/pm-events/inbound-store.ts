/**
 * Inbound PM-event delivery ledger (CRM-PR-A). One record per delivery, keyed by the
 * deterministic idempotency key `pm-outbox:<event_id>:crm`. A duplicate delivery
 * returns the existing record and creates NO second row.
 *
 * Retention: minimal envelope + payload_hash only — the full governed payload is NOT
 * stored by default (it can carry client-visible content). See the contract doc.
 */

export interface InboundPmDeliveryRecord {
  idempotencyKey: string;
  eventId: string;
  category: string;
  type: string;
  /** ISO-8601 string. */
  occurredAt: string;
  /** ISO-8601 string. */
  receivedAt: string;
  processingStatus: 'received' | 'processed' | 'failed';
  /** sha256 of the raw request body. Lets us detect a changed payload without storing it. */
  payloadHash: string;
  /** Bounded code only — never a raw message. */
  safeErrorCode?: string;
}

export interface InboundPmEventStore {
  get(idempotencyKey: string): Promise<InboundPmDeliveryRecord | null>;
  /**
   * Insert if absent. `created: false` ⇒ the key already existed (idempotent retry or
   * a concurrent-race loser). MUST be backed by a UNIQUE(idempotency_key) constraint
   * so concurrency is resolved at the database, not in app memory.
   */
  put(record: InboundPmDeliveryRecord): Promise<{ created: boolean }>;
}

/** In-memory store — for tests and local doubles only. Production uses Prisma. */
export class InMemoryInboundPmEventStore implements InboundPmEventStore {
  private readonly rows = new Map<string, InboundPmDeliveryRecord>();

  async get(idempotencyKey: string): Promise<InboundPmDeliveryRecord | null> {
    return this.rows.get(idempotencyKey) ?? null;
  }

  async put(record: InboundPmDeliveryRecord): Promise<{ created: boolean }> {
    if (this.rows.has(record.idempotencyKey)) return { created: false };
    this.rows.set(record.idempotencyKey, record);
    return { created: true };
  }

  /** Test helper. */
  size(): number {
    return this.rows.size;
  }
}
