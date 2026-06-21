import { describe, it, expect } from 'vitest';
import { PrismaInboundPmEventStore } from '../prisma-inbound-store';
import type { InboundPmDeliveryRecord } from '../inbound-store';

// Minimal raw-prisma double: $queryRaw/$executeRaw are tagged-template functions that
// ignore their args and return the canned value.
function fakePrisma(opts: { rows?: unknown[]; affected?: number }) {
  return {
    $queryRaw: async () => (opts.rows ?? []) as unknown,
    $executeRaw: async () => opts.affected ?? 0,
  } as unknown as ConstructorParameters<typeof PrismaInboundPmEventStore>[0];
}

const record: InboundPmDeliveryRecord = {
  idempotencyKey: 'pm-outbox:a03a5bd6-fa4f-4f9a-870f-2228f2312ee9:crm',
  eventId: 'a03a5bd6-fa4f-4f9a-870f-2228f2312ee9',
  category: 'project',
  type: 'stage_changed',
  occurredAt: '2026-06-20T10:00:00.000Z',
  receivedAt: '2026-06-21T12:00:00.000Z',
  processingStatus: 'received',
  payloadHash: 'abc123',
};

describe('PrismaInboundPmEventStore.get', () => {
  it('returns null when no row matches', async () => {
    const store = new PrismaInboundPmEventStore(fakePrisma({ rows: [] }));
    expect(await store.get('missing')).toBeNull();
  });

  it('maps a DB row to a record (ISO dates, undefined safeErrorCode when null)', async () => {
    const row = {
      idempotencyKey: record.idempotencyKey,
      eventId: record.eventId,
      category: 'project',
      type: 'stage_changed',
      occurredAt: new Date('2026-06-20T10:00:00.000Z'),
      receivedAt: new Date('2026-06-21T12:00:00.000Z'),
      processingStatus: 'received',
      payloadHash: 'abc123',
      safeErrorCode: null,
    };
    const store = new PrismaInboundPmEventStore(fakePrisma({ rows: [row] }));
    expect(await store.get('k')).toEqual({ ...record, safeErrorCode: undefined });
  });

  it('preserves a present safeErrorCode', async () => {
    const row = {
      idempotencyKey: record.idempotencyKey,
      eventId: record.eventId,
      category: 'project',
      type: 'stage_changed',
      occurredAt: new Date('2026-06-20T10:00:00.000Z'),
      receivedAt: new Date('2026-06-21T12:00:00.000Z'),
      processingStatus: 'failed',
      payloadHash: 'abc123',
      safeErrorCode: 'http_503',
    };
    const store = new PrismaInboundPmEventStore(fakePrisma({ rows: [row] }));
    const r = await store.get('k');
    expect(r?.safeErrorCode).toBe('http_503');
    expect(r?.processingStatus).toBe('failed');
  });
});

describe('PrismaInboundPmEventStore.put', () => {
  it('created:true when the insert affects a row', async () => {
    const store = new PrismaInboundPmEventStore(fakePrisma({ affected: 1 }));
    expect(await store.put(record)).toEqual({ created: true });
  });

  it('created:false on ON CONFLICT DO NOTHING (0 rows affected)', async () => {
    const store = new PrismaInboundPmEventStore(fakePrisma({ affected: 0 }));
    expect(await store.put(record)).toEqual({ created: false });
  });

  it('accepts a record with a safeErrorCode (null-coalesced binding)', async () => {
    const store = new PrismaInboundPmEventStore(fakePrisma({ affected: 1 }));
    expect(await store.put({ ...record, safeErrorCode: 'http_500' })).toEqual({ created: true });
  });
});
