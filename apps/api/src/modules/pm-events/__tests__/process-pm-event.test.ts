import { describe, it, expect } from 'vitest';
import { processPmEvent, type ProcessPmEventInput } from '../process-pm-event';
import { InMemoryInboundPmEventStore } from '../inbound-store';

// Test bearer fixture (NOT a real credential — a fixed >=16-char stub).
const BEARER = 'unit-test-fixture-bearer-000001';
const EVENT_ID = 'a03a5bd6-fa4f-4f9a-870f-2228f2312ee9';
const KEY = `pm-outbox:${EVENT_ID}:crm`;
const NOW = new Date('2026-06-21T12:00:00.000Z');

function envelope(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    eventId: EVENT_ID,
    sequence: 42,
    tenantSlug: 'nutri-gyn',
    category: 'project',
    type: 'stage_changed',
    occurredAt: '2026-06-20T10:00:00Z',
    schemaVersion: 1,
    visibility: 'client',
    payload: { from: 'in_progress', to: 'client_review' },
    ...over,
  });
}

function input(over: Partial<ProcessPmEventInput> = {}): ProcessPmEventInput {
  return {
    authorizationHeader: `Bearer ${BEARER}`,
    idempotencyKey: KEY,
    rawBody: envelope(),
    store: new InMemoryInboundPmEventStore(),
    secret: BEARER,
    now: () => NOW,
    ...over,
  };
}

describe('processPmEvent — auth', () => {
  it('503 (retryable) when the server secret is unset/too short', async () => {
    expect((await processPmEvent(input({ secret: undefined }))).statusCode).toBe(503);
    expect((await processPmEvent(input({ secret: 'short' }))).statusCode).toBe(503);
  });
  it('401 when the bearer is missing', async () => {
    const r = await processPmEvent(input({ authorizationHeader: null }));
    expect(r.statusCode).toBe(401);
    expect(r.body).toEqual({ accepted: false, error: 'unauthorized' });
  });
  it('401 when the bearer is wrong', async () => {
    expect((await processPmEvent(input({ authorizationHeader: 'Bearer nope' }))).statusCode).toBe(
      401
    );
  });
  it('accepts a valid bearer', async () => {
    expect((await processPmEvent(input())).statusCode).toBe(202);
  });
});

describe('processPmEvent — idempotency', () => {
  it('first delivery → 202 accepted, one row persisted', async () => {
    const store = new InMemoryInboundPmEventStore();
    const r = await processPmEvent(input({ store }));
    expect(r.body).toEqual({ accepted: true, duplicate: false });
    expect(r.statusCode).toBe(202);
    expect(store.size()).toBe(1);
  });
  it('duplicate key → 200 duplicate, NO second row', async () => {
    const store = new InMemoryInboundPmEventStore();
    await processPmEvent(input({ store }));
    const r = await processPmEvent(input({ store }));
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ accepted: true, duplicate: true });
    expect(store.size()).toBe(1);
  });
  it('concurrent-race loser (put returns created:false) → 200 duplicate', async () => {
    const racingStore = {
      get: async () => null,
      put: async () => ({ created: false }),
    };
    const r = await processPmEvent(input({ store: racingStore }));
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ accepted: true, duplicate: true });
  });
  it('missing Idempotency-Key → 400', async () => {
    expect((await processPmEvent(input({ idempotencyKey: null }))).statusCode).toBe(400);
  });
  it('random / malformed key → 400', async () => {
    expect((await processPmEvent(input({ idempotencyKey: 'random-key' }))).statusCode).toBe(400);
    expect(
      (await processPmEvent(input({ idempotencyKey: `pm-outbox:${EVENT_ID}:other` }))).statusCode
    ).toBe(400);
  });
  it('key ↔ body eventId mismatch → 400', async () => {
    const r = await processPmEvent(
      input({ idempotencyKey: 'pm-outbox:11111111-1111-1111-1111-111111111111:crm' })
    );
    expect(r.statusCode).toBe(400);
    expect(r.body).toEqual({ accepted: false, error: 'malformed' });
  });
});

describe('processPmEvent — validation', () => {
  it('bad JSON → 400', async () => {
    expect((await processPmEvent(input({ rawBody: '{not json' }))).statusCode).toBe(400);
  });
  it.each(['eventId', 'category', 'type', 'occurredAt', 'schemaVersion'])(
    'missing %s → 422',
    async (field) => {
      const body = JSON.parse(envelope());
      delete body[field];
      const r = await processPmEvent(input({ rawBody: JSON.stringify(body), idempotencyKey: KEY }));
      // dropping eventId still fails (422) because the envelope is invalid before the key match
      expect(r.statusCode).toBe(422);
      expect(r.body).toEqual({ accepted: false, error: 'invalid_envelope' });
    }
  );
  it('schemaVersion < 1 → 422', async () => {
    expect(
      (await processPmEvent(input({ rawBody: envelope({ schemaVersion: 0 }) }))).statusCode
    ).toBe(422);
  });
  it('bad occurredAt → 422', async () => {
    expect(
      (await processPmEvent(input({ rawBody: envelope({ occurredAt: 'not-a-date' }) }))).statusCode
    ).toBe(422);
  });
});

describe('processPmEvent — retry classification', () => {
  it('auth + malformed + invalid envelope are non-retryable 4xx (not 408/425/429)', async () => {
    const codes = [
      (await processPmEvent(input({ authorizationHeader: 'Bearer x' }))).statusCode, // 401
      (await processPmEvent(input({ idempotencyKey: 'bad' }))).statusCode, // 400
      (await processPmEvent(input({ rawBody: envelope({ category: '' }) }))).statusCode, // 422
    ];
    for (const c of codes) {
      expect(c).toBeGreaterThanOrEqual(400);
      expect(c).toBeLessThan(500);
      expect([408, 425, 429]).not.toContain(c);
    }
  });
  it('transient store failure → retryable 503', async () => {
    const throwingStore = {
      get: async () => {
        throw new Error('connection refused at 10.0.0.1:5432');
      },
      put: async () => ({ created: true }),
    };
    const r = await processPmEvent(input({ store: throwingStore }));
    expect(r.statusCode).toBe(503);
    expect(r.body).toEqual({ accepted: false, error: 'store_unavailable' });
  });
});

describe('processPmEvent — leakage', () => {
  it('every response is aggregate-only and never leaks payload/tenant/secret/raw error', async () => {
    const throwingStore = {
      get: async () => {
        throw new Error('SENSITIVE: tenant nutri-gyn row 42 bearer=' + BEARER);
      },
      put: async () => ({ created: true }),
    };
    const cases = [
      await processPmEvent(input()),
      await processPmEvent(input({ authorizationHeader: 'Bearer nope' })),
      await processPmEvent(input({ idempotencyKey: 'bad' })),
      await processPmEvent(input({ rawBody: envelope({ type: '' }) })),
      await processPmEvent(input({ store: throwingStore })),
    ];
    for (const r of cases) {
      const allowed = new Set(['accepted', 'duplicate', 'error']);
      expect(Object.keys(r.body).every((k) => allowed.has(k))).toBe(true);
      const s = JSON.stringify(r.body);
      expect(s).not.toContain(BEARER);
      expect(s).not.toContain('nutri-gyn');
      expect(s).not.toMatch(/payload|tenant|row 42|connection refused|5432/i);
    }
  });
});
