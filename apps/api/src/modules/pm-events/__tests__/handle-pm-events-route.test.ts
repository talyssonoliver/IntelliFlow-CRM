import { describe, it, expect, beforeEach, vi } from 'vitest';

// Avoid loading the real DI container (heavy, side-effecting) and the Prisma store.
vi.mock('../../container', () => ({ apiPrisma: {} }));
vi.mock('../prisma-inbound-store', () => {
  // The route's getStore() instantiates this once; an in-memory impl lets the REAL
  // processPmEvent run end-to-end without a database. Defined inline (vi.mock factories
  // are hoisted and cannot reference outer imports).
  class PrismaInboundPmEventStore {
    private readonly rows = new Map<string, { idempotencyKey: string }>();
    async get(key: string) {
      return this.rows.get(key) ?? null;
    }
    async put(record: { idempotencyKey: string }) {
      if (this.rows.has(record.idempotencyKey)) return { created: false };
      this.rows.set(record.idempotencyKey, record);
      return { created: true };
    }
  }
  return { PrismaInboundPmEventStore };
});

import { handlePmEventsRoute } from '../handle-pm-events-route';

const BEARER = 'unit-test-fixture-bearer-000001';
const PATH = '/api/internal/pm/events';

function delivery(uuid: string) {
  return {
    key: `pm-outbox:${uuid}:crm`,
    body: JSON.stringify({
      eventId: uuid,
      category: 'project',
      type: 'stage_changed',
      occurredAt: '2026-06-20T10:00:00Z',
      schemaVersion: 1,
    }),
  };
}

beforeEach(() => {
  process.env.PORTAL_INTERNAL_SECRET = BEARER;
});

describe('handlePmEventsRoute', () => {
  it('returns null for a non-matching path (falls through to other routes)', async () => {
    expect(await handlePmEventsRoute('/api/other', 'POST', {}, '')).toBeNull();
  });

  it('405 for a non-POST method on the matching path', async () => {
    expect(await handlePmEventsRoute(PATH, 'GET', {}, '')).toEqual({
      statusCode: 405,
      body: { error: 'method_not_allowed' },
    });
  });

  it('undefined method is treated as non-POST → 405', async () => {
    expect((await handlePmEventsRoute(PATH, undefined, {}, ''))?.statusCode).toBe(405);
  });

  it('dispatches a valid POST to the handler → 202 accepted', async () => {
    const d = delivery('11111111-1111-4111-8111-111111111111');
    const r = await handlePmEventsRoute(
      PATH,
      'POST',
      { authorization: `Bearer ${BEARER}`, 'idempotency-key': d.key },
      d.body
    );
    expect(r).toEqual({ statusCode: 202, body: { accepted: true, duplicate: false } });
  });

  it('extracts array-valued headers (takes the first) → 202', async () => {
    const d = delivery('22222222-2222-4222-8222-222222222222');
    const r = await handlePmEventsRoute(
      PATH,
      'POST',
      { authorization: [`Bearer ${BEARER}`], 'idempotency-key': [d.key] },
      d.body
    );
    expect(r?.statusCode).toBe(202);
  });

  it('missing auth header → 401 (header extraction returns null)', async () => {
    const d = delivery('33333333-3333-4333-8333-333333333333');
    const r = await handlePmEventsRoute(PATH, 'POST', { 'idempotency-key': d.key }, d.body);
    expect(r?.statusCode).toBe(401);
  });

  it('also serves the /internal/pm/events alias', async () => {
    const d = delivery('44444444-4444-4444-8444-444444444444');
    const r = await handlePmEventsRoute(
      '/internal/pm/events',
      'POST',
      { authorization: `Bearer ${BEARER}`, 'idempotency-key': d.key },
      d.body
    );
    expect(r?.statusCode).toBe(202);
  });
});
