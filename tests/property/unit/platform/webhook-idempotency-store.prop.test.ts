/**
 * Property tests for IdempotencyStore (in-memory) and stripeVerify inside
 * WebhookFramework (packages/webhooks/src/framework.ts).
 *
 * The IdempotencyStore is not exported directly; we exercise it through the
 * public WebhookFramework API which owns the store instance. Properties focus
 * on:
 *   - claim / complete / release / has / get / cleanup state-machine
 *   - At-most-once guarantee: two sequential handle() calls with the same
 *     event id fire handlers exactly once.
 *   - cleanup() removes TTL-expired entries and returns an accurate count.
 *   - stripeVerify() timing-window: rejects timestamps >300s old/future.
 *   - stripeVerify() signature: valid HMAC accepted; mutated payload rejected.
 *   - stripeVerify() structural: missing 't' or 'v1' parts always return false.
 *   - stripeVerify() is pure: same inputs always return same output.
 *
 * Source: race-condition-findings.json — webhooks-outbox-idempotency lane
 * (RACE-WEBHO-03, RACE-WEBHO-04, RACE-WEBHO-05).
 *
 * NOTE: The in-process atomic race (RACE-WEBHO-03) is already covered by
 * tests/property/concurrency/webhook-idempotency.prop.test.ts which proved
 * the fix is in place. This file covers the pure behavioural invariants of
 * the IdempotencyStore state-machine and stripeVerify timing contracts via
 * fast-check generators.
 *
 * @see packages/webhooks/src/framework.ts
 * @see docs/operations/property-testing/race-condition-findings.json RACE-WEBHO-03
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createHmac } from 'node:crypto';
import { createWebhookFramework, hmacSha256Verify, stripeVerify } from '@intelliflow/webhooks';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Inline arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** A short alphanumeric string suitable for event IDs. */
const arbEventId: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 32 })
  .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x') || 'x');

/** A printable ASCII string suitable for secrets and payloads. */
const arbAsciiString: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 128,
});

/** A non-empty secret string. */
const arbSecret: fc.Arbitrary<string> = fc.string({ minLength: 8, maxLength: 64 });

/** Any JSON-serialisable payload (object with string values). */
const arbPayloadRecord: fc.Arbitrary<Record<string, string>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.string({ maxLength: 30 }),
  { minKeys: 0, maxKeys: 6 }
);

/** A Stripe-format signature with a given timestamp and HMAC value. */
function makeStripeSignature(timestamp: number, v1: string): string {
  return `t=${timestamp},v1=${v1}`;
}

/** Compute the real Stripe v1 HMAC for a given payload/timestamp/secret. */
function computeStripeV1(payload: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal WebhookFramework with one source (no secret => no signature check). */
function makeFramework(secret = '', loggingEnabled = false) {
  const fw = createWebhookFramework({ retryEnabled: false, loggingEnabled });
  fw.registerSource({
    name: 'src',
    secret,
    signatureHeader: 'x-sig',
    signatureVerifier: hmacSha256Verify,
  });
  return fw;
}

// ---------------------------------------------------------------------------
// 1. IdempotencyStore — sequential at-most-once via handle()
//    The first call with a given event id executes the handler; the second
//    call (same id, same source, before TTL) is a no-op with success:true.
// ---------------------------------------------------------------------------

describe('IdempotencyStore via WebhookFramework.handle — sequential at-most-once', () => {
  test.prop([arbEventId, arbPayloadRecord], propertyParams())(
    'handler fires exactly once for two sequential calls with the same event id',
    async (eventId, extra) => {
      let calls = 0;
      const fw = makeFramework();

      fw.on('ping', async () => {
        calls++;
      });

      const body = JSON.stringify({ id: eventId, type: 'ping', ...extra });

      const r1 = await fw.handle('src', body, {});
      const r2 = await fw.handle('src', body, {});

      // Both calls must succeed (HTTP 200)
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);

      // Handler must fire exactly once (at-most-once guarantee)
      expect(calls).toBe(1);

      // Second call should be flagged as duplicate
      expect(r2.message).toMatch(/duplicate|no handler/i);
    }
  );

  test.prop([arbEventId, arbEventId], propertyParams())(
    'two events with different ids each fire the handler once',
    async (id1, id2) => {
      // Guard: fast-check may generate identical ids; skip those cases.
      fc.pre(id1 !== id2);

      let calls = 0;
      const fw = makeFramework();
      fw.on('ev', async () => {
        calls++;
      });

      const body1 = JSON.stringify({ id: id1, type: 'ev' });
      const body2 = JSON.stringify({ id: id2, type: 'ev' });

      await fw.handle('src', body1, {});
      await fw.handle('src', body2, {});

      expect(calls).toBe(2);
    }
  );
});

// ---------------------------------------------------------------------------
// 2. IdempotencyStore — release() allows reprocessing
//    When a handler throws, the framework calls idempotency.release() so the
//    same event id CAN be retried (the key must not remain permanently locked).
// ---------------------------------------------------------------------------

describe('IdempotencyStore — release on handler failure allows retry', () => {
  test.prop([arbEventId], propertyParams())(
    'after a failing handler, a second handle() call re-executes the handler',
    async (eventId) => {
      let attempt = 0;

      // First attempt throws; second succeeds.
      const fw = makeFramework();
      fw.on('retry-ev', async () => {
        attempt++;
        if (attempt === 1) throw new Error('transient failure');
      });

      const body = JSON.stringify({ id: eventId, type: 'retry-ev' });

      const r1 = await fw.handle('src', body, {});
      // First attempt should fail at the handler level
      expect(r1.success).toBe(false);
      expect(r1.statusCode).toBe(500);

      const r2 = await fw.handle('src', body, {});
      // Second attempt must succeed (idempotency was released, not locked)
      expect(r2.success).toBe(true);
      expect(attempt).toBe(2);
    }
  );
});

// ---------------------------------------------------------------------------
// 3. IdempotencyStore — cleanup() removes only expired entries
//    A framework configured with a very short TTL must report removed > 0
//    after the TTL elapses, while a framework with a long TTL must report
//    removed = 0 immediately after processing.
// ---------------------------------------------------------------------------

describe('IdempotencyStore.cleanup — removes only expired entries', () => {
  test.prop([arbEventId], propertyParams())(
    'cleanup with a far-future TTL removes zero entries immediately after processing',
    async (eventId) => {
      const fw = createWebhookFramework({
        retryEnabled: false,
        loggingEnabled: false,
        idempotencyTtlMs: 24 * 60 * 60 * 1000, // 24 h — nothing should expire
      });
      fw.registerSource({
        name: 'src',
        secret: '',
        signatureHeader: 'x-sig',
        signatureVerifier: hmacSha256Verify,
      });
      fw.on('ev', async () => {});

      const body = JSON.stringify({ id: eventId, type: 'ev' });
      await fw.handle('src', body, {});

      const { idempotencyRemoved } = fw.cleanup();
      expect(idempotencyRemoved).toBe(0);
    }
  );

  test.prop([arbEventId], propertyParams())(
    'cleanup with a TTL of 1ms removes the entry after it expires',
    async (eventId) => {
      const fw = createWebhookFramework({
        retryEnabled: false,
        loggingEnabled: false,
        idempotencyTtlMs: 1, // 1 ms — expires almost immediately
      });
      fw.registerSource({
        name: 'src',
        secret: '',
        signatureHeader: 'x-sig',
        signatureVerifier: hmacSha256Verify,
      });
      fw.on('ev', async () => {});

      const body = JSON.stringify({ id: eventId, type: 'ev' });
      await fw.handle('src', body, {});

      // Spin until at least 2 ms have passed so the 1 ms TTL is reliably elapsed.
      const deadline = Date.now() + 50;
      while (Date.now() < deadline) {
        /* busy-wait is safe here — this is a synchronous check */
      }

      const { idempotencyRemoved } = fw.cleanup();
      // The entry was written (it was once processed), so it should be cleaned up now.
      expect(idempotencyRemoved).toBeGreaterThanOrEqual(1);
    }
  );
});

// ---------------------------------------------------------------------------
// 4. stripeVerify — structural: missing 't' or 'v1' always returns false
// ---------------------------------------------------------------------------

describe('stripeVerify — structural invariants', () => {
  test.prop([arbAsciiString, arbSecret], propertyParams())(
    'returns false when signature has no t= or v1= parts',
    (payload, secret) => {
      // A completely empty or random string lacking the required parts
      expect(stripeVerify(payload, '', secret)).toBe(false);
      expect(stripeVerify(payload, 'bad', secret)).toBe(false);
      expect(stripeVerify(payload, 'key=value', secret)).toBe(false);
    }
  );

  test.prop([arbAsciiString, arbSecret], propertyParams())(
    'returns false when only t= is present (missing v1=)',
    (payload, secret) => {
      const now = Math.floor(Date.now() / 1000);
      expect(stripeVerify(payload, `t=${now}`, secret)).toBe(false);
    }
  );

  test.prop([arbAsciiString, arbSecret], propertyParams())(
    'returns false when only v1= is present (missing t=)',
    (payload, secret) => {
      const fakeHmac = createHmac('sha256', secret).update(payload).digest('hex');
      expect(stripeVerify(payload, `v1=${fakeHmac}`, secret)).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// 5. stripeVerify — timing window: rejects timestamps outside ±300 s
// ---------------------------------------------------------------------------

describe('stripeVerify — timing window invariant (±300 s tolerance)', () => {
  test.prop(
    [
      arbAsciiString,
      arbSecret,
      // Offsets well beyond the 300s window: pick from [350, 1000] seconds.
      fc.integer({ min: 350, max: 1000 }),
    ],
    propertyParams()
  )(
    'rejects a valid HMAC whose timestamp is more than 300 s in the past',
    (payload, secret, ageSec) => {
      const staleTs = Math.floor(Date.now() / 1000) - ageSec;
      const v1 = computeStripeV1(payload, staleTs, secret);
      const sig = makeStripeSignature(staleTs, v1);

      expect(stripeVerify(payload, sig, secret)).toBe(false);
    }
  );

  test.prop([arbAsciiString, arbSecret, fc.integer({ min: 350, max: 1000 })], propertyParams())(
    'rejects a valid HMAC whose timestamp is more than 300 s in the future',
    (payload, secret, futureSec) => {
      const futureTs = Math.floor(Date.now() / 1000) + futureSec;
      const v1 = computeStripeV1(payload, futureTs, secret);
      const sig = makeStripeSignature(futureTs, v1);

      expect(stripeVerify(payload, sig, secret)).toBe(false);
    }
  );

  test.prop(
    [
      arbAsciiString,
      arbSecret,
      // Offsets well within the 300s window: pick from [0, 250] seconds.
      fc.integer({ min: 0, max: 250 }),
    ],
    propertyParams()
  )(
    'accepts a valid HMAC whose timestamp is within ±250 s of now',
    (payload, secret, offsetSec) => {
      const ts = Math.floor(Date.now() / 1000) - offsetSec;
      const v1 = computeStripeV1(payload, ts, secret);
      const sig = makeStripeSignature(ts, v1);

      expect(stripeVerify(payload, sig, secret)).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// 6. stripeVerify — signature integrity: mutating payload invalidates signature
// ---------------------------------------------------------------------------

describe('stripeVerify — signature integrity', () => {
  test.prop([arbAsciiString, arbSecret], propertyParams())(
    'a valid signature is rejected when payload is mutated by appending a character',
    (payload, secret) => {
      const ts = Math.floor(Date.now() / 1000);
      const v1 = computeStripeV1(payload, ts, secret);
      const sig = makeStripeSignature(ts, v1);

      // Valid for the original payload
      expect(stripeVerify(payload, sig, secret)).toBe(true);

      // Mutated payload must be rejected
      expect(stripeVerify(payload + 'X', sig, secret)).toBe(false);
    }
  );

  test.prop([arbAsciiString, arbSecret], propertyParams())(
    'a valid signature is rejected when the secret changes',
    (payload, secret) => {
      fc.pre(secret !== secret + '!');
      const ts = Math.floor(Date.now() / 1000);
      const v1 = computeStripeV1(payload, ts, secret);
      const sig = makeStripeSignature(ts, v1);

      expect(stripeVerify(payload, sig, secret)).toBe(true);
      expect(stripeVerify(payload, sig, secret + '!')).toBe(false);
    }
  );

  test.prop([arbAsciiString, arbSecret], propertyParams())(
    'a fabricated (wrong) v1 value is always rejected',
    (payload, secret) => {
      const ts = Math.floor(Date.now() / 1000);
      const wrongV1 = 'deadbeef'.repeat(8); // 64-char hex-looking string, wrong value
      const sig = makeStripeSignature(ts, wrongV1);

      // The real HMAC for this payload would differ
      const realV1 = computeStripeV1(payload, ts, secret);
      // Guard: only run the assertion when the fabricated value is different
      fc.pre(wrongV1 !== realV1);

      expect(stripeVerify(payload, sig, secret)).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// 7. stripeVerify — purity: same inputs always produce same output
// ---------------------------------------------------------------------------

describe('stripeVerify — determinism / purity', () => {
  test.prop([arbAsciiString, arbAsciiString, arbSecret], propertyParams())(
    'calling stripeVerify twice with identical arguments yields the same result',
    (payload, signature, secret) => {
      const r1 = stripeVerify(payload, signature, secret);
      const r2 = stripeVerify(payload, signature, secret);
      expect(r1).toBe(r2);
    }
  );
});

// ---------------------------------------------------------------------------
// 8. IdempotencyStore — metrics: eventsProcessed increments by exactly 1
//    per unique event id (not by the number of duplicate deliveries).
// ---------------------------------------------------------------------------

describe('IdempotencyStore via getMetrics — eventsProcessed invariant', () => {
  test.prop([arbEventId, fc.integer({ min: 2, max: 6 })], propertyParams())(
    'eventsProcessed increments by exactly 1 regardless of duplicate delivery count',
    async (eventId, duplicates) => {
      const fw = makeFramework();
      fw.on('chk', async () => {});

      const body = JSON.stringify({ id: eventId, type: 'chk' });

      const before = fw.getMetrics().eventsProcessed;

      for (let i = 0; i < duplicates; i++) {
        await fw.handle('src', body, {});
      }

      const after = fw.getMetrics().eventsProcessed;
      expect(after - before).toBe(1);
    }
  );
});

// ---------------------------------------------------------------------------
// 9. IdempotencyStore — eventsReceived tracks every delivery (including dupes)
// ---------------------------------------------------------------------------

describe('IdempotencyStore via getMetrics — eventsReceived invariant', () => {
  test.prop([arbEventId, fc.integer({ min: 1, max: 8 })], propertyParams())(
    'eventsReceived increments once per handle() call regardless of idempotency',
    async (eventId, n) => {
      const fw = makeFramework();
      fw.on('rcv', async () => {});

      const body = JSON.stringify({ id: eventId, type: 'rcv' });
      const before = fw.getMetrics().eventsReceived;

      for (let i = 0; i < n; i++) {
        await fw.handle('src', body, {});
      }

      const after = fw.getMetrics().eventsReceived;
      expect(after - before).toBe(n);
    }
  );
});
